import { findAirportByCode } from "../../data/airports.ts";
import { createItinerary, type Itinerary } from "../../types/itinerary.ts";
import type { FlightOffer, Money } from "../../types/flight.ts";
import {
  buildDirectDestinationsCacheKey,
  getDirectDestinationsCache,
  runCachedDirectDestinations,
  type DirectDestinationsCache,
} from "../cache/directDestinationsCache.ts";
import {
  buildFlightCalendarCacheKey,
  getFlightCalendarCache,
  runCachedFlightCalendar,
  type FlightCalendarCache,
} from "../cache/flightCalendarCache.ts";
import {
  buildFlightOffersCacheKey,
  getFlightOffersCache,
  runCachedFlightOffers,
  type FlightOffersCache,
} from "../cache/flightOffersCache.ts";
import {
  MAX_H2_PER_H1,
  MAX_TWO_STOP_PAIR_ATTEMPTS,
  MAX_TWO_STOP_H1_CANDIDATES,
  MAX_TWO_STOP_STAY_NIGHTS,
  EXTREME_DURATION_MIN_EXTRA_MINUTES,
  EXTREME_DURATION_RATIO,
  EXTREME_DURATION_REQUIRED_SAVINGS_RATIO,
  MIN_TWO_STOP_STAY_NIGHTS,
  TARGET_TWO_STOP_STAY_NIGHTS,
  TWO_STOP_MAX_PATH_DETOUR_RATIO,
  TWO_STOP_MIN_DIRECT_DISTANCE_KM,
} from "../constants/planner.ts";
import type {
  DirectDestination,
  DirectDestinationsProvider,
  FlightCalendarDay,
  FlightCalendarProvider,
  FlightProvider,
} from "../providers/types.ts";
import { addCalendarDays, calendarDayDifference } from "../utils/dateWindow.ts";
import { distanceKm, type Coordinates } from "../utils/geography.ts";
import { isFlightWithinDepartureWindow, isReasonableFlight } from "./filters.ts";
import type { HubCandidate } from "./hubCandidates.ts";
import type { DetailedOfferTrace } from "./verifyHubCandidates.ts";
import type { ValidatedHubCandidate } from "./validateHubCandidates.ts";

type WarningFunction = (message: string) => void;

export interface TwoStopEligibilityInput {
  directDistanceKm: number;
  oneStopAdventureCount: number;
}

export interface TwoStopEligibility {
  eligible: boolean;
  slotsNeeded: number;
  reason: "short_distance" | "portfolio_full" | "eligible";
}

/** Kept deliberately small and transparent for the V1 launch. */
export function shouldExploreTwoStopovers({
  directDistanceKm,
  oneStopAdventureCount,
}: TwoStopEligibilityInput): TwoStopEligibility {
  const slotsNeeded = Math.max(0, 3 - oneStopAdventureCount);
  if (directDistanceKm < TWO_STOP_MIN_DIRECT_DISTANCE_KM) {
    return { eligible: false, slotsNeeded, reason: "short_distance" };
  }
  if (oneStopAdventureCount >= 3) {
    return { eligible: false, slotsNeeded: 0, reason: "portfolio_full" };
  }
  return { eligible: true, slotsNeeded, reason: "eligible" };
}

export interface ObservedConnectionAirport {
  airportCode: string;
  city: string;
  country: string;
}

/**
 * Detailed H1→destination offers are useful evidence, even when that H1 did
 * not become a final one-stop card. Airline connections are only a bonus: H2
 * Explore discovery below remains independent from this evidence.
 */
export function observedConnectionsByH1(
  traces: DetailedOfferTrace[],
): Map<string, ObservedConnectionAirport[]> {
  const result = new Map<string, ObservedConnectionAirport[]>();
  for (const trace of traces) {
    if (trace.leg !== "second") continue;
    const h1 = trace.origin.trim().toUpperCase();
    const known = result.get(h1) ?? [];
    for (const offer of trace.offers) {
      for (const segment of offer.segments.slice(0, -1)) {
        const airportCode = segment.destination.trim().toUpperCase();
        const airport = findAirportByCode(airportCode);
        if (!airportCode || known.some((entry) => entry.airportCode === airportCode)) continue;
        known.push({
          airportCode,
          city: airport?.city ?? airportCode,
          country: airport?.country ?? "",
        });
      }
    }
    if (known.length > 0) result.set(h1, known);
  }
  return result;
}

export interface TwoStopH2Candidate {
  airportCode: string;
  city: string;
  country: string;
  source: "observed_connection" | "explore" | "observed_connection+explore";
  combinedPathDetourRatio: number;
  indicativePrice?: number;
  currency?: string;
  indicativeDurationMinutes?: number;
  candidateScore: number;
}

export interface TwoStopScoreBreakdown {
  price: number;
  duration: number;
  stops: number;
  detour: number;
  stay: number;
  final: number;
}

export interface TwoStopApiAccounting {
  h1ExploreCalls: number;
  firstLegDetailedCalls: number;
  middleCalendarCalls: number;
  middleDetailedCalls: number;
  finalCalendarCalls: number;
  finalDetailedCalls: number;
  cacheHits: number;
}

export interface DiscoverTwoStopRoutesInput {
  origin: string;
  destination: string;
  adults: number;
  h1Candidates: ValidatedHubCandidate[];
  observedConnections: Map<string, ObservedConnectionAirport[]>;
  slotsNeeded: number;
}

export interface DiscoverTwoStopRoutesDependencies {
  directDestinationsProvider: DirectDestinationsProvider;
  flightCalendarProvider: FlightCalendarProvider;
  flightProvider: FlightProvider;
  directDestinationsCache?: DirectDestinationsCache | null;
  flightCalendarCache?: FlightCalendarCache | null;
  flightOffersCache?: FlightOffersCache | null;
  warn?: WarningFunction;
}

export interface TwoStopDiscoveryResult {
  itineraries: Itinerary[];
  scoreBreakdowns: Array<{
    h1: string;
    h2: string;
    score: TwoStopScoreBreakdown;
  }>;
  h1Candidates: ValidatedHubCandidate[];
  h2Candidates: Array<{ h1: string; candidates: TwoStopH2Candidate[] }>;
  attemptedPairs: number;
  failures: string[];
  api: TwoStopApiAccounting;
}

interface VerifiedTwoStopRoute {
  h1: ValidatedHubCandidate;
  h2: TwoStopH2Candidate;
  firstLeg: FlightOffer;
  middleLeg: FlightOffer;
  finalLeg: FlightOffer;
  h1StayNights: number;
  h2StayNights: number;
  totalPrice: Money;
  totalDuration: number;
  scoreBreakdown: TwoStopScoreBreakdown;
  score: number;
}

function airportCoordinates(code: string): Coordinates | undefined {
  const airport = findAirportByCode(code);
  return airport ? { latitude: airport.latitude, longitude: airport.longitude } : undefined;
}

function localDate(timestamp: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(timestamp);
  return match?.[1];
}

function selectNonstopOffer(
  offers: FlightOffer[], origin: string, destination: string, departureDate: string,
): FlightOffer | undefined {
  return [...offers]
    .filter((offer) => offer.origin === origin && offer.destination === destination)
    .filter((offer) => isFlightWithinDepartureWindow(offer, { start: departureDate, end: departureDate }))
    .filter((offer) => offer.stops === 0 && isReasonableFlight(offer))
    .sort((left, right) =>
      left.indicativePrice.amount - right.indicativePrice.amount ||
      left.durationMinutes - right.durationMinutes || left.id.localeCompare(right.id),
    )[0];
}

function selectCalendarDate(arrivalDate: string, calendar: FlightCalendarDay[]): {
  departureDate: string; stayNights: number;
} | undefined {
  return calendar
    .filter((day) => day.hasFlights && day.price !== undefined && Number.isFinite(day.price))
    .map((day) => ({ departureDate: day.departureDate, stayNights: calendarDayDifference(arrivalDate, day.departureDate), price: day.price as number }))
    .filter((day) => day.stayNights >= MIN_TWO_STOP_STAY_NIGHTS && day.stayNights <= MAX_TWO_STOP_STAY_NIGHTS)
    .sort((left, right) =>
      (left.price * (1 + Math.abs(left.stayNights - TARGET_TWO_STOP_STAY_NIGHTS) * 0.04)) -
        (right.price * (1 + Math.abs(right.stayNights - TARGET_TWO_STOP_STAY_NIGHTS) * 0.04)) ||
      left.departureDate.localeCompare(right.departureDate),
    )[0];
}

function h1Selection(candidates: ValidatedHubCandidate[]): ValidatedHubCandidate[] {
  const selected = new Map<string, ValidatedHubCandidate>();
  for (const candidate of [...candidates].sort((left, right) =>
    right.validationScore - left.validationScore || left.airportCode.localeCompare(right.airportCode),
  )) {
    const code = candidate.airportCode.trim().toUpperCase();
    if (!selected.has(code)) selected.set(code, candidate);
    if (selected.size === MAX_TWO_STOP_H1_CANDIDATES) break;
  }
  return [...selected.values()];
}

function h2CandidateScore(input: {
  detour: number; observed: boolean; price?: number; duration?: number;
}): number {
  const geography = Math.max(0, (TWO_STOP_MAX_PATH_DETOUR_RATIO - input.detour) * 50);
  const observed = input.observed ? 12 : 0;
  const price = input.price === undefined ? 0 : Math.max(0, 1 - Math.min(input.price, 1_500) / 1_500) * 10;
  const duration = input.duration === undefined ? 0 : Math.max(0, 1 - Math.min(input.duration, 1_440) / 1_440) * 8;
  return Number((geography + observed + price + duration).toFixed(3));
}

export function rankTwoStopH2Candidates(input: {
  origin: string; h1: HubCandidate; destination: string;
  observedConnections: ObservedConnectionAirport[]; exploreDestinations: DirectDestination[];
}): TwoStopH2Candidate[] {
  const origin = input.origin.trim().toUpperCase();
  const h1 = input.h1.airportCode.trim().toUpperCase();
  const destination = input.destination.trim().toUpperCase();
  const originCoordinates = airportCoordinates(origin);
  const h1Coordinates = airportCoordinates(h1);
  const destinationCoordinates = airportCoordinates(destination);
  if (!originCoordinates || !h1Coordinates || !destinationCoordinates) return [];
  const directDistance = distanceKm(originCoordinates, destinationCoordinates);
  if (directDistance <= 0) return [];
  const choices = new Map<string, {
    airportCode: string; city: string; country: string; observed: boolean;
    explore?: DirectDestination;
  }>();
  for (const observed of input.observedConnections) {
    choices.set(observed.airportCode, { ...observed, observed: true });
  }
  for (const explore of input.exploreDestinations) {
    const code = explore.airportCode.trim().toUpperCase();
    const existing = choices.get(code);
    choices.set(code, {
      airportCode: code, city: explore.city, country: explore.country,
      observed: existing?.observed ?? false, explore,
    });
  }
  return [...choices.values()].flatMap((choice) => {
    const h2Coordinates = airportCoordinates(choice.airportCode) ??
      (choice.explore ? { latitude: choice.explore.latitude, longitude: choice.explore.longitude } : undefined);
    if (!h2Coordinates || [origin, h1, destination].includes(choice.airportCode)) return [];
    const detour = (
      distanceKm(originCoordinates, h1Coordinates) + distanceKm(h1Coordinates, h2Coordinates) +
      distanceKm(h2Coordinates, destinationCoordinates)
    ) / directDistance;
    if (!Number.isFinite(detour) || detour > TWO_STOP_MAX_PATH_DETOUR_RATIO) return [];
    const source: TwoStopH2Candidate["source"] = choice.observed
      ? choice.explore ? "observed_connection+explore" : "observed_connection"
      : "explore";
    return [{
      airportCode: choice.airportCode, city: choice.city, country: choice.country, source,
      combinedPathDetourRatio: Number(detour.toFixed(4)),
      ...(choice.explore?.indicativePrice === undefined ? {} : { indicativePrice: choice.explore.indicativePrice }),
      ...(choice.explore?.currency ? { currency: choice.explore.currency } : {}),
      ...(choice.explore?.flightDurationMinutes === undefined ? {} : { indicativeDurationMinutes: choice.explore.flightDurationMinutes }),
      candidateScore: h2CandidateScore({ detour, observed: choice.observed, price: choice.explore?.indicativePrice, duration: choice.explore?.flightDurationMinutes }),
    }];
  }).sort((left, right) =>
    right.candidateScore - left.candidateScore || left.combinedPathDetourRatio - right.combinedPathDetourRatio ||
    left.airportCode.localeCompare(right.airportCode),
  ).slice(0, MAX_H2_PER_H1);
}

function totalPrice(legs: FlightOffer[]): Money | undefined {
  const currency = legs[0]?.indicativePrice.currency;
  if (!currency || legs.some((leg) => leg.indicativePrice.currency !== currency)) return undefined;
  return { amount: legs.reduce((sum, leg) => sum + leg.indicativePrice.amount, 0), currency };
}

function scoreRoutes(routes: VerifiedTwoStopRoute[]): VerifiedTwoStopRoute[] {
  // This comparison is intentionally confined to the two-stop category. A
  // single structurally valid route is never rejected merely for being the
  // only candidate, and it never competes against a one-stop duration.
  const fastestRoute = [...routes].sort((left, right) => left.totalDuration - right.totalDuration)[0];
  const survivors = fastestRoute ? routes.filter((route) => {
    if (route === fastestRoute) return true;
    const extreme = route.totalDuration >= fastestRoute.totalDuration * EXTREME_DURATION_RATIO &&
      route.totalDuration >= fastestRoute.totalDuration + EXTREME_DURATION_MIN_EXTRA_MINUTES;
    if (!extreme) return true;
    const savings = (fastestRoute.totalPrice.amount - route.totalPrice.amount) / fastestRoute.totalPrice.amount;
    return savings >= EXTREME_DURATION_REQUIRED_SAVINGS_RATIO;
  }) : routes;
  const cheapest = Math.min(...survivors.map((route) => route.totalPrice.amount));
  const fastest = Math.min(...survivors.map((route) => route.totalDuration));
  return survivors.map((route) => {
    const price = 100 * cheapest / route.totalPrice.amount;
    const duration = 100 * fastest / route.totalDuration;
    const detour = Math.max(0, ((TWO_STOP_MAX_PATH_DETOUR_RATIO - route.h2.combinedPathDetourRatio) / (TWO_STOP_MAX_PATH_DETOUR_RATIO - 1)) * 100);
    const stay = ((100 - Math.abs(route.h1StayNights - TARGET_TWO_STOP_STAY_NIGHTS) * 20) + (100 - Math.abs(route.h2StayNights - TARGET_TWO_STOP_STAY_NIGHTS) * 20)) / 2;
    const final = (price * 45 + duration * 30 + 100 * 10 + detour * 10 + stay * 5) / 100;
    const scoreBreakdown = {
      price: Number(price.toFixed(3)), duration: Number(duration.toFixed(3)), stops: 100,
      detour: Number(detour.toFixed(3)), stay: Number(stay.toFixed(3)), final: Number(final.toFixed(3)),
    };
    return { ...route, scoreBreakdown, score: scoreBreakdown.final };
  }).sort((left, right) => right.score - left.score || left.h2.airportCode.localeCompare(right.h2.airportCode));
}

export async function discoverTwoStopRoutes(
  input: DiscoverTwoStopRoutesInput,
  dependencies: DiscoverTwoStopRoutesDependencies,
): Promise<TwoStopDiscoveryResult> {
  const h1Candidates = h1Selection(input.h1Candidates);
  const directDestinationsCache = dependencies.directDestinationsCache === undefined
    ? getDirectDestinationsCache()
    : dependencies.directDestinationsCache;
  const flightCalendarCache = dependencies.flightCalendarCache === undefined
    ? getFlightCalendarCache()
    : dependencies.flightCalendarCache;
  const flightOffersCache = dependencies.flightOffersCache === undefined
    ? getFlightOffersCache()
    : dependencies.flightOffersCache;
  const api: TwoStopApiAccounting = {
    h1ExploreCalls: 0, firstLegDetailedCalls: 0, middleCalendarCalls: 0,
    middleDetailedCalls: 0, finalCalendarCalls: 0, finalDetailedCalls: 0, cacheHits: 0,
  };
  const failures: string[] = [];
  const h2Candidates: Array<{ h1: string; candidates: TwoStopH2Candidate[] }> = [];
  const verified: VerifiedTwoStopRoute[] = [];
  let attemptedPairs = 0;
  const warn = dependencies.warn ?? console.warn;
  const recordCache = (status: "HIT" | "MISS", field: keyof Omit<TwoStopApiAccounting, "cacheHits">) => {
    if (status === "HIT") api.cacheHits += 1;
    else api[field] += 1;
  };
  const origin = input.origin.trim().toUpperCase();
  const destination = input.destination.trim().toUpperCase();

  for (const h1 of h1Candidates) {
    if (verified.length >= input.slotsNeeded || attemptedPairs >= MAX_TWO_STOP_PAIR_ATTEMPTS) break;
    try {
      const firstResult = await runCachedFlightOffers({
        key: buildFlightOffersCacheKey({ origin, destination: h1.airportCode, departureDate: h1.firstLegDepartureDate, adults: input.adults }),
        cache: flightOffersCache,
        load: () => dependencies.flightProvider.searchOneWay({ origin, destination: h1.airportCode, departureWindow: { start: h1.firstLegDepartureDate, end: h1.firstLegDepartureDate }, adults: input.adults }),
        warn,
      });
      recordCache(firstResult.cacheStatus, "firstLegDetailedCalls");
      const firstLeg = selectNonstopOffer(firstResult.value, origin, h1.airportCode, h1.firstLegDepartureDate);
      const h1ArrivalDate = firstLeg ? localDate(firstLeg.arrivalAt) : undefined;
      if (!firstLeg || !h1ArrivalDate) {
        failures.push(`${h1.airportCode}: no usable nonstop first leg.`);
        continue;
      }
      const exploreDate = addCalendarDays(h1ArrivalDate, TARGET_TWO_STOP_STAY_NIGHTS);
      const exploreResult = await runCachedDirectDestinations({
        key: buildDirectDestinationsCacheKey({ origin: h1.airportCode, departureDate: exploreDate }),
        cache: directDestinationsCache,
        load: () => dependencies.directDestinationsProvider.getDirectDestinations({ origin: h1.airportCode, departureDate: exploreDate }),
        warn,
      });
      recordCache(exploreResult.cacheStatus, "h1ExploreCalls");
      const rankedH2 = rankTwoStopH2Candidates({
        origin, h1, destination, exploreDestinations: exploreResult.value,
        observedConnections: input.observedConnections.get(h1.airportCode.trim().toUpperCase()) ?? [],
      });
      h2Candidates.push({ h1: h1.airportCode, candidates: rankedH2 });
      for (const h2 of rankedH2) {
        if (verified.length >= input.slotsNeeded || attemptedPairs >= MAX_TWO_STOP_PAIR_ATTEMPTS) break;
        attemptedPairs += 1;
        const middleCalendar = await runCachedFlightCalendar({
          key: buildFlightCalendarCacheKey({ origin: h1.airportCode, destination: h2.airportCode, startDate: addCalendarDays(h1ArrivalDate, MIN_TWO_STOP_STAY_NIGHTS), endDate: addCalendarDays(h1ArrivalDate, MAX_TWO_STOP_STAY_NIGHTS), stopPolicy: "nonstop" }),
          cache: flightCalendarCache,
          load: () => dependencies.flightCalendarProvider.getFlightCalendar({ origin: h1.airportCode, destination: h2.airportCode, departureWindow: { start: addCalendarDays(h1ArrivalDate, MIN_TWO_STOP_STAY_NIGHTS), end: addCalendarDays(h1ArrivalDate, MAX_TWO_STOP_STAY_NIGHTS) }, stopPolicy: "nonstop" }),
          warn,
        });
        recordCache(middleCalendar.cacheStatus, "middleCalendarCalls");
        const middleDate = selectCalendarDate(h1ArrivalDate, middleCalendar.value);
        if (!middleDate) continue;
        const middleResult = await runCachedFlightOffers({
          key: buildFlightOffersCacheKey({ origin: h1.airportCode, destination: h2.airportCode, departureDate: middleDate.departureDate, adults: input.adults }),
          cache: flightOffersCache,
          load: () => dependencies.flightProvider.searchOneWay({ origin: h1.airportCode, destination: h2.airportCode, departureWindow: { start: middleDate.departureDate, end: middleDate.departureDate }, adults: input.adults }), warn,
        });
        recordCache(middleResult.cacheStatus, "middleDetailedCalls");
        const middleLeg = selectNonstopOffer(middleResult.value, h1.airportCode, h2.airportCode, middleDate.departureDate);
        const h2ArrivalDate = middleLeg ? localDate(middleLeg.arrivalAt) : undefined;
        if (!middleLeg || !h2ArrivalDate) continue;
        const finalCalendar = await runCachedFlightCalendar({
          key: buildFlightCalendarCacheKey({ origin: h2.airportCode, destination, startDate: addCalendarDays(h2ArrivalDate, MIN_TWO_STOP_STAY_NIGHTS), endDate: addCalendarDays(h2ArrivalDate, MAX_TWO_STOP_STAY_NIGHTS), stopPolicy: "nonstop" }),
          cache: flightCalendarCache,
          load: () => dependencies.flightCalendarProvider.getFlightCalendar({ origin: h2.airportCode, destination, departureWindow: { start: addCalendarDays(h2ArrivalDate, MIN_TWO_STOP_STAY_NIGHTS), end: addCalendarDays(h2ArrivalDate, MAX_TWO_STOP_STAY_NIGHTS) }, stopPolicy: "nonstop" }), warn,
        });
        recordCache(finalCalendar.cacheStatus, "finalCalendarCalls");
        const finalDate = selectCalendarDate(h2ArrivalDate, finalCalendar.value);
        if (!finalDate) continue;
        const finalResult = await runCachedFlightOffers({
          key: buildFlightOffersCacheKey({ origin: h2.airportCode, destination, departureDate: finalDate.departureDate, adults: input.adults }),
          cache: flightOffersCache,
          load: () => dependencies.flightProvider.searchOneWay({ origin: h2.airportCode, destination, departureWindow: { start: finalDate.departureDate, end: finalDate.departureDate }, adults: input.adults }), warn,
        });
        recordCache(finalResult.cacheStatus, "finalDetailedCalls");
        const finalLeg = selectNonstopOffer(finalResult.value, h2.airportCode, destination, finalDate.departureDate);
        if (!finalLeg) continue;
        const price = totalPrice([firstLeg, middleLeg, finalLeg]);
        if (!price) { failures.push(`${h1.airportCode} → ${h2.airportCode}: leg currencies differ.`); continue; }
        verified.push({ h1, h2, firstLeg, middleLeg, finalLeg, h1StayNights: middleDate.stayNights, h2StayNights: finalDate.stayNights, totalPrice: price, totalDuration: firstLeg.durationMinutes + middleLeg.durationMinutes + finalLeg.durationMinutes, scoreBreakdown: { price: 0, duration: 0, stops: 0, detour: 0, stay: 0, final: 0 }, score: 0 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown optional two-stop failure.";
      warn(`Two-stop discovery failed for ${h1.airportCode}: ${message}`);
      failures.push(`${h1.airportCode}: ${message}`);
    }
  }
  const rankedRoutes = scoreRoutes(verified).slice(0, input.slotsNeeded);
  return {
    itineraries: rankedRoutes.map((route) => createItinerary({
      origin, destination, score: route.score,
      legs: [
        { flight: route.firstLeg, stopoverAfter: { airportCode: route.h1.airportCode, city: route.h1.city, country: route.h1.country, nights: route.h1StayNights } },
        { flight: route.middleLeg, stopoverAfter: { airportCode: route.h2.airportCode, city: route.h2.city, country: route.h2.country, nights: route.h2StayNights } },
        { flight: route.finalLeg },
      ],
    })),
    scoreBreakdowns: rankedRoutes.map((route) => ({
      h1: route.h1.airportCode,
      h2: route.h2.airportCode,
      score: route.scoreBreakdown,
    })),
    h1Candidates, h2Candidates, attemptedPairs, failures, api,
  };
}
