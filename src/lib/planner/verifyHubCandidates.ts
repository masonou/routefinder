import {
  buildFlightOffersCacheKey,
  getFlightOffersCache,
  runCachedFlightOffers,
  type FlightOffersCache,
} from "../cache/flightOffersCache.ts";
import {
  DETAILED_VERIFICATION_CONCURRENCY,
  EXTREME_DURATION_MIN_EXTRA_MINUTES,
  EXTREME_DURATION_RATIO,
  EXTREME_DURATION_REQUIRED_SAVINGS_RATIO,
  MAX_HUB_STAY_NIGHTS,
  MAX_HUB_DETOUR_RATIO,
  MAX_VERIFIED_HUBS,
  MIN_HUB_STAY_NIGHTS,
  TARGET_HUB_STAY_NIGHTS,
  VERIFIED_ROUTE_DETOUR_WEIGHT,
  VERIFIED_ROUTE_DURATION_WEIGHT,
  VERIFIED_ROUTE_PRICE_WEIGHT,
  VERIFIED_ROUTE_STAY_WEIGHT,
  VERIFIED_ROUTE_STOPS_WEIGHT,
} from "../constants/planner.ts";
import type { FlightProvider } from "../providers/types.ts";
import { normalizeSearchApiError, type NormalizedSearchApiError } from "../providers/searchApi.ts";
import { FatalSearchStageError } from "./fatalStageFailure.ts";
import { calculateHubStayNights, isFlightWithinDepartureWindow, isReasonableFlight } from "./filters.ts";
import type { OnwardFlightPolicy, ValidatedHubCandidate } from "./validateHubCandidates.ts";
import type { FlightOffer, Money } from "../../types/flight.ts";
import {
  calculateItineraryFlightDuration,
  calculateItineraryStops,
  calculateItineraryTotalPrice,
} from "../../types/itinerary.ts";

export interface VerifiedRouteScoreBreakdown {
  price: number;
  duration: number;
  stops: number;
  detour: number;
  stay: number;
  final: number;
}

export interface VerifiedHubRoute {
  hub: ValidatedHubCandidate;
  onwardPolicy: OnwardFlightPolicy;
  firstLeg: FlightOffer;
  secondLeg: FlightOffer;
  hubStayNights: number;
  totalPrice: Money;
  totalFlightDurationMinutes: number;
  totalStops: number;
  calendarEstimatedTotal?: number;
  calendarDifference?: number;
  calendarDifferencePercent?: number;
  scoreBreakdown: VerifiedRouteScoreBreakdown;
  score: number;
}

export interface DetailedVerificationRejection {
  airportCode: string;
  reason: string;
}

export interface DetailedVerificationFailure {
  airportCode: string;
  message: string;
  cause: NormalizedSearchApiError;
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
  onDetailedOffers?: (trace: DetailedOfferTrace) => void;
  throwOnAllFailures?: boolean;
}

export interface DetailedOfferTrace {
  airportCode: string;
  leg: "first" | "second";
  origin: string;
  destination: string;
  departureDate: string;
  offers: FlightOffer[];
  cacheStatus: "HIT" | "MISS";
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
  cause: NormalizedSearchApiError;
}

type CandidateOutcome = CandidateSuccess | CandidateRejection | CandidateFailure;

function createDetailedVerificationFailure(
  airportCode: string,
  message: string,
  cause: NormalizedSearchApiError,
): DetailedVerificationFailure {
  const failure = { airportCode, message } as DetailedVerificationFailure;
  Object.defineProperty(failure, "cause", { value: cause, enumerable: false });
  return failure;
}

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

function selectSecondLeg(
  offers: FlightOffer[],
  onwardPolicy: OnwardFlightPolicy,
): FlightOffer | undefined {
  return [...offers]
    .filter((offer) => onwardPolicy === "nonstop" ? offer.stops === 0 : offer.stops <= 2)
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

  const legs = [{ flight: firstLeg }, { flight: secondLeg }];
  const totalPrice = calculateItineraryTotalPrice(legs);
  const totalFlightDurationMinutes = calculateItineraryFlightDuration(legs);
  const totalStops = calculateItineraryStops(legs);
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
    // Detailed offers are the final authority: a fallback Calendar result can
    // still turn into the cleaner nonstop itinerary.
    onwardPolicy: secondLeg.stops === 0 ? "nonstop" : "connecting_fallback",
    firstLeg,
    secondLeg,
    hubStayNights,
    totalPrice,
    totalFlightDurationMinutes,
    totalStops,
    ...(calendarEstimatedTotal === undefined ? {} : { calendarEstimatedTotal }),
    ...(calendarDifference === undefined ? {} : { calendarDifference }),
    ...(calendarDifferencePercent === undefined ? {} : { calendarDifferencePercent }),
    scoreBreakdown: {
      price: 0,
      duration: 0,
      stops: 0,
      detour: 0,
      stay: 0,
      final: 0,
    },
    score: 0,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function stayQuality(stayNights: number): number {
  const deviation = Math.abs(stayNights - TARGET_HUB_STAY_NIGHTS);
  if (deviation === 0) return 100;
  if (deviation === 1) return 80;
  return 60;
}

function stopsQuality(totalStops: number): number {
  if (totalStops <= 0) return 100;
  if (totalStops === 1) return 70;
  return 40;
}

function routeScoreBreakdown(
  route: VerifiedHubRoute,
  allRoutes: VerifiedHubRoute[],
): VerifiedRouteScoreBreakdown {
  const cheapestPrice = Math.min(
    ...allRoutes.map((candidate) => candidate.totalPrice.amount),
  );
  const shortestDuration = Math.min(
    ...allRoutes.map((candidate) => candidate.totalFlightDurationMinutes),
  );
  // Price and duration use stable ratios to the best available detailed route;
  // stops, detour, and stay use fixed absolute scales. Adding or removing an
  // unrelated candidate cannot turn a small difference into 100 versus zero.
  const price =
    route.totalPrice.amount > 0
      ? clampScore((100 * cheapestPrice) / route.totalPrice.amount)
      : 0;
  const duration =
    route.totalFlightDurationMinutes > 0
      ? clampScore((100 * shortestDuration) / route.totalFlightDurationMinutes)
      : 0;
  const stops = stopsQuality(route.totalStops);
  const detour = clampScore(
    ((MAX_HUB_DETOUR_RATIO - route.hub.detourRatio) /
      (MAX_HUB_DETOUR_RATIO - 1)) *
      100,
  );
  const stay = stayQuality(route.hubStayNights);
  const final =
    (price * VERIFIED_ROUTE_PRICE_WEIGHT +
      duration * VERIFIED_ROUTE_DURATION_WEIGHT +
      stops * VERIFIED_ROUTE_STOPS_WEIGHT +
      detour * VERIFIED_ROUTE_DETOUR_WEIGHT +
      stay * VERIFIED_ROUTE_STAY_WEIGHT) /
    100;

  return {
    price: Number(price.toFixed(3)),
    duration: Number(duration.toFixed(3)),
    stops: Number(stops.toFixed(3)),
    detour: Number(detour.toFixed(3)),
    stay: Number(stay.toFixed(3)),
    final: Number(final.toFixed(3)),
  };
}

function isExtremeDurationOutlier(
  route: VerifiedHubRoute,
  fastestRoute: VerifiedHubRoute,
): boolean {
  return (
    route !== fastestRoute &&
    route.totalFlightDurationMinutes >=
      fastestRoute.totalFlightDurationMinutes * EXTREME_DURATION_RATIO &&
    route.totalFlightDurationMinutes >=
      fastestRoute.totalFlightDurationMinutes + EXTREME_DURATION_MIN_EXTRA_MINUTES
  );
}

export interface RankVerifiedRoutesResult {
  verifiedRoutes: VerifiedHubRoute[];
  rejected: DetailedVerificationRejection[];
}

export function rankVerifiedRoutes(
  routes: VerifiedHubRoute[],
): RankVerifiedRoutesResult {
  if (routes.length === 0) {
    return { verifiedRoutes: [], rejected: [] };
  }

  const fastestRoute = [...routes].sort(
    (left, right) =>
      left.totalFlightDurationMinutes - right.totalFlightDurationMinutes ||
      left.totalPrice.amount - right.totalPrice.amount ||
      left.hub.airportCode.localeCompare(right.hub.airportCode),
  )[0] as VerifiedHubRoute;
  const rejected: DetailedVerificationRejection[] = [];
  const survivors = routes.filter((route) => {
    if (!isExtremeDurationOutlier(route, fastestRoute)) {
      return true;
    }

    const priceSavingsRatio =
      (fastestRoute.totalPrice.amount - route.totalPrice.amount) /
      fastestRoute.totalPrice.amount;
    if (priceSavingsRatio >= EXTREME_DURATION_REQUIRED_SAVINGS_RATIO) {
      return true;
    }

    const additionalDurationPercent =
      ((route.totalFlightDurationMinutes - fastestRoute.totalFlightDurationMinutes) /
        fastestRoute.totalFlightDurationMinutes) *
      100;
    rejected.push({
      airportCode: route.hub.airportCode,
      reason: `Duration outlier: ${additionalDurationPercent.toFixed(0)}% longer than the fastest route and price savings below the required ${(EXTREME_DURATION_REQUIRED_SAVINGS_RATIO * 100).toFixed(0)}%.`,
    });
    return false;
  });

  return {
    verifiedRoutes: survivors
      .map((route) => {
        const scoreBreakdown = routeScoreBreakdown(route, survivors);
        return { ...route, scoreBreakdown, score: scoreBreakdown.final };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.totalPrice.amount - right.totalPrice.amount ||
          left.totalFlightDurationMinutes - right.totalFlightDurationMinutes ||
          left.totalStops - right.totalStops ||
          left.hub.airportCode.localeCompare(right.hub.airportCode),
      )
      .slice(0, MAX_VERIFIED_HUBS),
    rejected,
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
          options.onDetailedOffers?.({
            airportCode: hub.airportCode,
            leg,
            origin: legOrigin,
            destination: legDestination,
            departureDate,
            offers: result.value,
            cacheStatus: result.cacheStatus,
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
          hub.onwardPolicy,
        );
        if (!secondLeg) {
          return {
            type: "rejected",
            airportCode: hub.airportCode,
            reason: hub.onwardPolicy === "nonstop"
              ? "No usable nonstop detailed onward flight was found."
              : "No usable detailed onward flight with two stops or fewer was found.",
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
        const cause = normalizeSearchApiError(error);
        const message = cause.message;
        warn(`Detailed verification failed for ${hub.airportCode}: ${message}`);
        return { type: "failure", airportCode: hub.airportCode, message, cause };
      }
    },
  );

  const verifiedCandidateRoutes = outcomes
    .filter((outcome): outcome is CandidateSuccess => outcome.type === "success")
    .map((outcome) => outcome.route);
  const rankedRoutes = rankVerifiedRoutes(verifiedCandidateRoutes);
  const verifiedRoutes = rankedRoutes.verifiedRoutes;
  const failures = outcomes
    .filter((outcome): outcome is CandidateFailure => outcome.type === "failure")
    .map(({ airportCode, message, cause }) =>
      createDetailedVerificationFailure(airportCode, message, cause),
    );

  if (
    options.throwOnAllFailures !== false &&
    candidates.length > 0 &&
    verifiedRoutes.length === 0 &&
    failures.length === candidates.length
  ) {
    throw new FatalSearchStageError(
      "detailed",
      failures.map((failure) => failure.cause),
    );
  }

  return {
    verifiedRoutes,
    rejected: outcomes
      .filter((outcome): outcome is CandidateRejection => outcome.type === "rejected")
      .map(({ airportCode, reason }) => ({ airportCode, reason }))
      .concat(rankedRoutes.rejected),
    failures,
    detailedLookups: outcomes
      .filter(
        (outcome): outcome is CandidateSuccess | CandidateRejection =>
          outcome.type === "success" || outcome.type === "rejected",
      )
      .flatMap((outcome) => outcome.lookups),
  };
}
