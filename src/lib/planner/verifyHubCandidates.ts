import {
  buildFlightOffersCacheKey,
  getFlightOffersCache,
  runCachedFlightOffers,
  type FlightOffersCache,
} from "../cache/flightOffersCache.ts";
import {
  DETAILED_VERIFICATION_CONCURRENCY,
  MAX_HUB_STAY_NIGHTS,
  MAX_VERIFIED_HUBS,
  MIN_HUB_STAY_NIGHTS,
} from "../constants/planner.ts";
import type { FlightProvider } from "../providers/types.ts";
import { calculateHubStayNights, isFlightWithinDepartureWindow, isReasonableFlight } from "./filters.ts";
import { scoreRouteMetrics } from "./scoreRoute.ts";
import type { ValidatedHubCandidate } from "./validateHubCandidates.ts";
import type { FlightOffer, Money } from "../../types/flight.ts";

const GEOGRAPHIC_DETOUR_WEIGHT = 50;

export interface VerifiedHubRoute {
  hub: ValidatedHubCandidate;
  firstLeg: FlightOffer;
  secondLeg: FlightOffer;
  hubStayNights: number;
  totalPrice: Money;
  totalFlightDurationMinutes: number;
  totalStops: number;
  calendarEstimatedTotal?: number;
  calendarDifference?: number;
  calendarDifferencePercent?: number;
  score: number;
}

export interface DetailedVerificationRejection {
  airportCode: string;
  reason: string;
}

export interface DetailedVerificationFailure {
  airportCode: string;
  message: string;
}

export interface DetailedVerificationLookup {
  airportCode: string;
  leg: "first" | "second";
  cacheStatus: "HIT" | "MISS";
}

export interface VerifyHubCandidatesInput {
  origin: string;
  destination: string;
  candidates: ValidatedHubCandidate[];
  adults?: number;
}

export interface VerifyHubCandidatesOptions {
  cache?: FlightOffersCache | null;
  warn?: (message: string) => void;
}

export interface VerifyHubCandidatesResult {
  verifiedRoutes: VerifiedHubRoute[];
  rejected: DetailedVerificationRejection[];
  failures: DetailedVerificationFailure[];
  detailedLookups: DetailedVerificationLookup[];
}

interface CandidateSuccess {
  type: "success";
  route: VerifiedHubRoute;
  lookups: DetailedVerificationLookup[];
}

interface CandidateRejection {
  type: "rejected";
  airportCode: string;
  reason: string;
  lookups: DetailedVerificationLookup[];
}

interface CandidateFailure {
  type: "failure";
  airportCode: string;
  message: string;
}

type CandidateOutcome = CandidateSuccess | CandidateRejection | CandidateFailure;

function isMatchingOffer(
  offer: FlightOffer,
  origin: string,
  destination: string,
  departureDate: string,
): boolean {
  return (
    offer.origin === origin &&
    offer.destination === destination &&
    isFlightWithinDepartureWindow(offer, {
      start: departureDate,
      end: departureDate,
    }) &&
    isReasonableFlight(offer)
  );
}

function selectFirstLeg(offers: FlightOffer[]): FlightOffer | undefined {
  return [...offers]
    .filter((offer) => offer.stops === 0)
    .sort(
      (left, right) =>
        left.indicativePrice.amount - right.indicativePrice.amount ||
        left.durationMinutes - right.durationMinutes ||
        left.id.localeCompare(right.id),
    )[0];
}

function onwardOfferCost(offer: FlightOffer): number {
  // Reuses the detailed planner's price/duration/stop trade-off: 12 extra
  // flying hours plus one stop costs 75.6 score units, so a small fare saving
  // cannot hide a materially worse onward journey.
  return (
    offer.indicativePrice.amount + offer.durationMinutes * 0.08 + offer.stops * 18
  );
}

function selectSecondLeg(offers: FlightOffer[]): FlightOffer | undefined {
  return [...offers]
    .filter((offer) => offer.stops <= 2)
    .sort(
      (left, right) =>
        onwardOfferCost(left) - onwardOfferCost(right) ||
        left.indicativePrice.amount - right.indicativePrice.amount ||
        left.durationMinutes - right.durationMinutes ||
        left.stops - right.stops ||
        left.id.localeCompare(right.id),
    )[0];
}

function createVerifiedRoute(
  hub: ValidatedHubCandidate,
  firstLeg: FlightOffer,
  secondLeg: FlightOffer,
): VerifiedHubRoute | DetailedVerificationRejection {
  if (firstLeg.indicativePrice.currency !== secondLeg.indicativePrice.currency) {
    return {
      airportCode: hub.airportCode,
      reason: "Detailed leg currencies differ, so a total cannot be calculated safely.",
    };
  }

  const hubStayNights = calculateHubStayNights(firstLeg, secondLeg);
  if (
    hubStayNights < MIN_HUB_STAY_NIGHTS ||
    hubStayNights > MAX_HUB_STAY_NIGHTS
  ) {
    return {
      airportCode: hub.airportCode,
      reason: "Detailed flight times do not preserve a 2–6 night hub stay.",
    };
  }

  const totalPrice = {
    amount: firstLeg.indicativePrice.amount + secondLeg.indicativePrice.amount,
    currency: firstLeg.indicativePrice.currency,
  };
  const totalFlightDurationMinutes =
    firstLeg.durationMinutes + secondLeg.durationMinutes;
  const totalStops = firstLeg.stops + secondLeg.stops;
  const baseScore = scoreRouteMetrics({
    totalPrice,
    totalFlightDurationMinutes,
    totalStops,
    hubStayNights,
  });
  const calendarEstimatedTotal = hub.estimatedTotalPrice;
  const calendarDifference =
    calendarEstimatedTotal === undefined
      ? undefined
      : totalPrice.amount - calendarEstimatedTotal;
  const calendarDifferencePercent =
    calendarDifference === undefined || calendarEstimatedTotal === undefined || calendarEstimatedTotal === 0
      ? undefined
      : (calendarDifference / calendarEstimatedTotal) * 100;

  return {
    hub,
    firstLeg,
    secondLeg,
    hubStayNights,
    totalPrice,
    totalFlightDurationMinutes,
    totalStops,
    ...(calendarEstimatedTotal === undefined ? {} : { calendarEstimatedTotal }),
    ...(calendarDifference === undefined ? {} : { calendarDifference }),
    ...(calendarDifferencePercent === undefined ? {} : { calendarDifferencePercent }),
    // Real detailed price, duration, stops, and stay receive the existing
    // planner scoring. Geographic detour is a smaller explicit penalty.
    score: Number((baseScore - hub.detourRatio * GEOGRAPHIC_DETOUR_WEIGHT).toFixed(3)),
  };
}

function isRejection(
  value: VerifiedHubRoute | DetailedVerificationRejection,
): value is DetailedVerificationRejection {
  return "reason" in value;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return results;
}

export async function verifyHubCandidates(
  input: VerifyHubCandidatesInput,
  provider: FlightProvider,
  options: VerifyHubCandidatesOptions = {},
): Promise<VerifyHubCandidatesResult> {
  const origin = input.origin.trim().toUpperCase();
  const destination = input.destination.trim().toUpperCase();
  const adults = input.adults ?? 1;
  if (!origin || !destination) {
    throw new Error("Origin and destination are required.");
  }
  if (!Number.isInteger(adults) || adults <= 0) {
    throw new Error("Adults must be a positive integer.");
  }

  const cache = options.cache === undefined ? getFlightOffersCache() : options.cache;
  const warn = options.warn ?? console.warn;
  const candidates = input.candidates.slice(0, MAX_VERIFIED_HUBS);
  const outcomes = await mapWithConcurrency(
    candidates,
    DETAILED_VERIFICATION_CONCURRENCY,
    async (hub): Promise<CandidateOutcome> => {
      try {
        const loadLeg = async (
          leg: "first" | "second",
          legOrigin: string,
          legDestination: string,
          departureDate: string,
        ) => {
          const result = await runCachedFlightOffers({
            key: buildFlightOffersCacheKey({
              origin: legOrigin,
              destination: legDestination,
              departureDate,
              adults,
            }),
            cache,
            load: () =>
              provider.searchOneWay({
                origin: legOrigin,
                destination: legDestination,
                departureWindow: { start: departureDate, end: departureDate },
                adults,
              }),
            warn,
          });
          return { ...result, leg };
        };

        const [firstResult, secondResult] = await Promise.all([
          loadLeg("first", origin, hub.airportCode, hub.firstLegDepartureDate),
          loadLeg("second", hub.airportCode, destination, hub.bestOnwardDate),
        ]);
        const firstLeg = selectFirstLeg(
          firstResult.value.filter((offer) =>
            isMatchingOffer(
              offer,
              origin,
              hub.airportCode,
              hub.firstLegDepartureDate,
            ),
          ),
        );
        if (!firstLeg) {
          return {
            type: "rejected",
            airportCode: hub.airportCode,
            reason: "No usable nonstop detailed first-leg flight was found.",
            lookups: [
              { airportCode: hub.airportCode, leg: firstResult.leg, cacheStatus: firstResult.cacheStatus },
              { airportCode: hub.airportCode, leg: secondResult.leg, cacheStatus: secondResult.cacheStatus },
            ],
          };
        }

        const secondLeg = selectSecondLeg(
          secondResult.value.filter((offer) =>
            isMatchingOffer(
              offer,
              hub.airportCode,
              destination,
              hub.bestOnwardDate,
            ),
          ),
        );
        if (!secondLeg) {
          return {
            type: "rejected",
            airportCode: hub.airportCode,
            reason: "No usable detailed onward flight with two stops or fewer was found.",
            lookups: [
              { airportCode: hub.airportCode, leg: firstResult.leg, cacheStatus: firstResult.cacheStatus },
              { airportCode: hub.airportCode, leg: secondResult.leg, cacheStatus: secondResult.cacheStatus },
            ],
          };
        }

        const route = createVerifiedRoute(hub, firstLeg, secondLeg);
        if (isRejection(route)) {
          return {
            type: "rejected",
            ...route,
            lookups: [
              { airportCode: hub.airportCode, leg: firstResult.leg, cacheStatus: firstResult.cacheStatus },
              { airportCode: hub.airportCode, leg: secondResult.leg, cacheStatus: secondResult.cacheStatus },
            ],
          };
        }

        return {
          type: "success",
          route,
          lookups: [
            { airportCode: hub.airportCode, leg: firstResult.leg, cacheStatus: firstResult.cacheStatus },
            { airportCode: hub.airportCode, leg: secondResult.leg, cacheStatus: secondResult.cacheStatus },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : "Detailed flight provider request failed.";
        warn(`Detailed verification failed for ${hub.airportCode}: ${message}`);
        return { type: "failure", airportCode: hub.airportCode, message };
      }
    },
  );

  const verifiedRoutes = outcomes
    .filter((outcome): outcome is CandidateSuccess => outcome.type === "success")
    .map((outcome) => outcome.route)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.totalPrice.amount - right.totalPrice.amount ||
        left.totalFlightDurationMinutes - right.totalFlightDurationMinutes ||
        left.totalStops - right.totalStops ||
        left.hub.airportCode.localeCompare(right.hub.airportCode),
    )
    .slice(0, MAX_VERIFIED_HUBS);
  const failures = outcomes
    .filter((outcome): outcome is CandidateFailure => outcome.type === "failure")
    .map(({ airportCode, message }) => ({ airportCode, message }));

  if (candidates.length > 0 && verifiedRoutes.length === 0 && failures.length === candidates.length) {
    throw new Error("Detailed verification failed for every candidate.");
  }

  return {
    verifiedRoutes,
    rejected: outcomes
      .filter((outcome): outcome is CandidateRejection => outcome.type === "rejected")
      .map(({ airportCode, reason }) => ({ airportCode, reason })),
    failures,
    detailedLookups: outcomes
      .filter(
        (outcome): outcome is CandidateSuccess | CandidateRejection =>
          outcome.type === "success" || outcome.type === "rejected",
      )
      .flatMap((outcome) => outcome.lookups),
  };
}
