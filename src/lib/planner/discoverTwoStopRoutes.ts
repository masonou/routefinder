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
  MAX_TWO_STOP_RESULTS,
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
import { arrivesByDate, calculateHubStayNights, hasMeaningfulStopover, isFlightWithinDepartureWindow, isReasonableFlight } from "./filters.ts";
import type { HubCandidate } from "./hubCandidates.ts";
import type { DetailedOfferTrace } from "./verifyHubCandidates.ts";
import { elapsedMs, nowMs, type RequestTiming } from "../instrumentation/searchTiming.ts";

type WarningFunction = (message: string) => void;

export interface TwoStopEligibilityInput {
  directDistanceKm: number;
  cleanOneStopAdventureCount: number;
  journeyWindowDays?: number;
}

export interface TwoStopEligibility {
  eligible: boolean;
  targetResults: number;
  reason: "short_distance" | "portfolio_full" | "insufficient_journey_window" | "eligible";
}

/** Kept deliberately small and transparent for the V1 launch. */
export function shouldExploreTwoStopovers({
  directDistanceKm,
  cleanOneStopAdventureCount,
  journeyWindowDays,
}: TwoStopEligibilityInput): TwoStopEligibility {
  if (journeyWindowDays !== undefined && journeyWindowDays < MIN_TWO_STOP_STAY_NIGHTS * 2) {
    return { eligible: false, targetResults: 0, reason: "insufficient_journey_window" };
  }
  if (directDistanceKm < TWO_STOP_MIN_DIRECT_DISTANCE_KM) {
    return { eligible: false, targetResults: 0, reason: "short_distance" };
  }
  if (cleanOneStopAdventureCount >= 3) {
    return { eligible: false, targetResults: 0, reason: "portfolio_full" };
  }
  return { eligible: true, targetResults: MAX_TWO_STOP_RESULTS, reason: "eligible" };
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
  fromH1Explore: boolean;
  reverseNetworkMatch: boolean;
  observedConnection: boolean;
  combinedPathDetourRatio: number;
  indicativePrice?: number;
  currency?: string;
  indicativeDurationMinutes?: number;
  candidateScore: number;
}

export type TwoStopH1Role = "independent-primary" | "independent-secondary" | "proven-one-stop";
export interface TwoStopH1Candidate extends HubCandidate {
  role?: TwoStopH1Role;
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
  h1Candidates: TwoStopH1Candidate[];
  observedConnections: Map<string, ObservedConnectionAirport[]>;
  reverseDestinationNetwork?: ReadonlySet<string> | Promise<ReadonlySet<string>>;
  targetResults: number;
  arriveByDate?: string;
}

export interface DiscoverTwoStopRoutesDependencies {
  directDestinationsProvider: DirectDestinationsProvider;
  flightCalendarProvider: FlightCalendarProvider;
  flightProvider: FlightProvider;
  directDestinationsCache?: DirectDestinationsCache | null;
  flightCalendarCache?: FlightCalendarCache | null;
  flightOffersCache?: FlightOffersCache | null;
  warn?: WarningFunction;
  onItineraryVerified?: (itinerary: Itinerary) => void;
}

export interface TwoStopDiscoveryResult {
  itineraries: Itinerary[];
  scoreBreakdowns: Array<{
    h1: string;
    h2: string;
    score: TwoStopScoreBreakdown;
  }>;
  h1Candidates: TwoStopH1Candidate[];
  h2Candidates: Array<{ h1: string; candidates: TwoStopH2Candidate[] }>;
  pairAttemptSchedule: Array<{ h1: string; h2: string }>;
  attemptedPairs: number;
  failures: string[];
  /** Number of H1 branches that ended in a provider/cache technical failure. */
  technicalFailureCount: number;
  api: TwoStopApiAccounting;
  timing: Pick<RequestTiming, "twoStopH1SelectionMs" | "twoStopNetworkDiscoveryWallMs" | "twoStopExploreWallMs" | "twoStopExploreRequests" | "twoStopExploreLiveRequests" | "twoStopExploreCacheHits" | "twoStopPairCandidateProcessingMs" | "twoStopPairValidationWallMs" | "twoStopPairValidationWaves" | "twoStopCalendarWallMs" | "twoStopCalendarRequests" | "twoStopCalendarLiveRequests" | "twoStopCalendarCacheHits" | "twoStopDetailedWallMs" | "twoStopDetailedRequests" | "twoStopDetailedLiveRequests" | "twoStopDetailedCacheHits">;
}

interface VerifiedTwoStopRoute {
  h1: TwoStopH1Candidate;
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

function selectCalendarDate(arrivalDate: string, calendar: FlightCalendarDay[], arriveByDate?: string): {
  departureDate: string; stayNights: number;
} | undefined {
  return calendar
    .filter((day) => day.hasFlights && day.price !== undefined && Number.isFinite(day.price))
    .map((day) => ({ departureDate: day.departureDate, stayNights: calendarDayDifference(arrivalDate, day.departureDate), price: day.price as number }))
    .filter((day) => day.stayNights >= MIN_TWO_STOP_STAY_NIGHTS && day.stayNights <= MAX_TWO_STOP_STAY_NIGHTS)
    .filter((day) => !arriveByDate || day.departureDate <= arriveByDate)
    .sort((left, right) =>
      (left.price * (1 + Math.abs(left.stayNights - TARGET_TWO_STOP_STAY_NIGHTS) * 0.04)) -
        (right.price * (1 + Math.abs(right.stayNights - TARGET_TWO_STOP_STAY_NIGHTS) * 0.04)) ||
      left.departureDate.localeCompare(right.departureDate),
    )[0];
}

export function selectHybridTwoStopH1Candidates(input: {
  forwardCandidates: HubCandidate[];
  provenCleanRoutes: Array<{ hub: HubCandidate }>;
}): TwoStopH1Candidate[] {
  const independent = [...input.forwardCandidates].sort((left, right) =>
    right.candidateScore - left.candidateScore || left.airportCode.localeCompare(right.airportCode),
  );
  const selected: TwoStopH1Candidate[] = [];
  const add = (candidate: HubCandidate, role: TwoStopH1Role) => {
    const code = candidate.airportCode.trim().toUpperCase();
    if (selected.some((entry) => entry.airportCode.trim().toUpperCase() === code)) return false;
    selected.push({ ...candidate, role });
    return true;
  };
  const first = independent[0];
  if (first) add(first, "independent-primary");
  for (const route of input.provenCleanRoutes) {
    if (selected.length >= MAX_TWO_STOP_H1_CANDIDATES) break;
    add(route.hub, "proven-one-stop");
  }
  for (const candidate of independent) {
    if (selected.length >= MAX_TWO_STOP_H1_CANDIDATES) break;
    add(candidate, selected.length === 0 ? "independent-primary" : "independent-secondary");
  }
  return selected;
}

function h1Selection(candidates: TwoStopH1Candidate[]): TwoStopH1Candidate[] {
  const selected = new Map<string, TwoStopH1Candidate>();
  for (const candidate of candidates) {
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

function h2EvidenceTier(candidate: Pick<TwoStopH2Candidate, "fromH1Explore" | "reverseNetworkMatch" | "observedConnection">): number {
  if (candidate.fromH1Explore && candidate.reverseNetworkMatch && candidate.observedConnection) return 4;
  if (candidate.fromH1Explore && candidate.reverseNetworkMatch) return 3;
  if (candidate.fromH1Explore && candidate.observedConnection) return 2;
  return candidate.fromH1Explore ? 1 : 0;
}

export function buildRoundRobinPairSchedule(
  entries: Array<{ h1: TwoStopH1Candidate; candidates: TwoStopH2Candidate[] }>,
  maxAttempts = MAX_TWO_STOP_PAIR_ATTEMPTS,
): Array<{ h1: TwoStopH1Candidate; h2: TwoStopH2Candidate }> {
  const schedule: Array<{ h1: TwoStopH1Candidate; h2: TwoStopH2Candidate }> = [];
  for (let index = 0; schedule.length < maxAttempts; index += 1) {
    let added = false;
    for (const entry of entries) {
      const h2 = entry.candidates[index];
      if (!h2 || schedule.length === maxAttempts) continue;
      schedule.push({ h1: entry.h1, h2 });
      added = true;
    }
    if (!added) break;
  }
  return schedule;
}

export function rankTwoStopH2Candidates(input: {
  origin: string; h1: HubCandidate; destination: string;
  observedConnections: ObservedConnectionAirport[]; exploreDestinations: DirectDestination[];
  reverseDestinationNetwork?: ReadonlySet<string>;
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
    airportCode: string; city: string; country: string; observed: boolean; fromH1Explore: boolean;
    explore?: DirectDestination;
  }>();
  for (const observed of input.observedConnections) {
    choices.set(observed.airportCode, { ...observed, observed: true, fromH1Explore: false });
  }
  for (const explore of input.exploreDestinations) {
    const code = explore.airportCode.trim().toUpperCase();
    const existing = choices.get(code);
    choices.set(code, {
      airportCode: code, city: explore.city, country: explore.country,
      observed: existing?.observed ?? false, explore,
      fromH1Explore: true,
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
      fromH1Explore: choice.fromH1Explore,
      reverseNetworkMatch: (input.reverseDestinationNetwork ?? new Set<string>()).has(choice.airportCode),
      observedConnection: choice.observed,
      combinedPathDetourRatio: Number(detour.toFixed(4)),
      ...(choice.explore?.indicativePrice === undefined ? {} : { indicativePrice: choice.explore.indicativePrice }),
      ...(choice.explore?.currency ? { currency: choice.explore.currency } : {}),
      ...(choice.explore?.flightDurationMinutes === undefined ? {} : { indicativeDurationMinutes: choice.explore.flightDurationMinutes }),
      candidateScore: h2CandidateScore({ detour, observed: choice.observed, price: choice.explore?.indicativePrice, duration: choice.explore?.flightDurationMinutes }),
    }];
  }).sort((left, right) =>
    h2EvidenceTier(right) - h2EvidenceTier(left) ||
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
  const networkDiscoveryStartedAt = nowMs();
  const h1SelectionStartedAt = nowMs();
  const h1Candidates = h1Selection(input.h1Candidates);
  const twoStopH1SelectionMs = elapsedMs(h1SelectionStartedAt);
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
  let technicalFailureCount = 0;
  const h2Candidates: Array<{ h1: string; candidates: TwoStopH2Candidate[] }> = [];
  const verified: VerifiedTwoStopRoute[] = [];
  let attemptedPairs = 0;
  let twoStopExploreWallMs = 0;
  let twoStopPairCandidateProcessingMs = 0;
  let twoStopCalendarWallMs = 0;
  let twoStopDetailedWallMs = 0;
  const stageCache = { explore: [] as Array<"HIT" | "MISS">, calendar: [] as Array<"HIT" | "MISS">, detailed: [] as Array<"HIT" | "MISS"> };
  const warn = dependencies.warn ?? console.warn;
  const recordCache = (status: "HIT" | "MISS", field: keyof Omit<TwoStopApiAccounting, "cacheHits">) => {
    if (status === "HIT") api.cacheHits += 1;
    else api[field] += 1;
  };
  const recordStageCache = (stage: keyof typeof stageCache, status: "HIT" | "MISS", field: keyof Omit<TwoStopApiAccounting, "cacheHits">) => {
    stageCache[stage].push(status);
    recordCache(status, field);
  };
  const origin = input.origin.trim().toUpperCase();
  const destination = input.destination.trim().toUpperCase();

  type PreparedH1 = { h1: TwoStopH1Candidate; firstLeg: FlightOffer; h1ArrivalDate: string; candidates: TwoStopH2Candidate[] };
  const failedH1 = new Set<string>();
  const recordH1Failure = (h1: TwoStopH1Candidate, error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown optional two-stop failure.";
    warn(`Two-stop discovery failed for ${h1.airportCode}: ${message}`);
    failures.push(`${h1.airportCode}: ${message}`);
    if (!failedH1.has(h1.airportCode)) {
      failedH1.add(h1.airportCode);
      technicalFailureCount += 1;
    }
  };
  const firstLegStartedAt = nowMs();
  const firstLegOutcomes = await Promise.all(h1Candidates.map(async (h1) => {
    try {
      const result = await runCachedFlightOffers({
        key: buildFlightOffersCacheKey({ origin, destination: h1.airportCode, departureDate: h1.firstLegDepartureDate, adults: input.adults }), cache: flightOffersCache,
        load: () => dependencies.flightProvider.searchOneWay({ origin, destination: h1.airportCode, departureWindow: { start: h1.firstLegDepartureDate, end: h1.firstLegDepartureDate }, adults: input.adults }), warn,
      });
      return { h1, result };
    } catch (error) { return { h1, error }; }
  }));
  twoStopDetailedWallMs += elapsedMs(firstLegStartedAt);
  const firstLegReady: Array<{ h1: TwoStopH1Candidate; firstLeg: FlightOffer; h1ArrivalDate: string }> = [];
  for (const outcome of firstLegOutcomes) {
    if ("error" in outcome) { recordH1Failure(outcome.h1, outcome.error); continue; }
    recordStageCache("detailed", outcome.result.cacheStatus, "firstLegDetailedCalls");
    const firstLeg = selectNonstopOffer(outcome.result.value, origin, outcome.h1.airportCode, outcome.h1.firstLegDepartureDate);
    const h1ArrivalDate = firstLeg ? localDate(firstLeg.arrivalAt) : undefined;
    if (!firstLeg || !h1ArrivalDate) { failures.push(`${outcome.h1.airportCode}: no usable nonstop first leg.`); continue; }
    firstLegReady.push({ h1: outcome.h1, firstLeg, h1ArrivalDate });
  }
  const h1ExploreStartedAt = nowMs();
  const exploreOutcomes = await Promise.all(firstLegReady.map(async (entry) => {
    try {
      const exploreDate = addCalendarDays(entry.h1ArrivalDate, TARGET_TWO_STOP_STAY_NIGHTS);
      const result = await runCachedDirectDestinations({
        key: buildDirectDestinationsCacheKey({ origin: entry.h1.airportCode, departureDate: exploreDate }), cache: directDestinationsCache,
        load: () => dependencies.directDestinationsProvider.getDirectDestinations({ origin: entry.h1.airportCode, departureDate: exploreDate }), warn,
      });
      return { ...entry, result };
    } catch (error) { return { ...entry, error }; }
  }));
  twoStopExploreWallMs += elapsedMs(h1ExploreStartedAt);
  // Reverse Explore is an independent signal. Await it only when H2 ranking
  // needs the set, allowing its D..D+3 requests to overlap first-leg and H1
  // Explore work above.
  const reverseDestinationNetwork = await input.reverseDestinationNetwork;
  const preparedH1: PreparedH1[] = [];
  for (const outcome of exploreOutcomes) {
    if ("error" in outcome) { recordH1Failure(outcome.h1, outcome.error); continue; }
    recordStageCache("explore", outcome.result.cacheStatus, "h1ExploreCalls");
    const pairProcessingStartedAt = nowMs();
    const candidates = rankTwoStopH2Candidates({ origin, h1: outcome.h1, destination, exploreDestinations: outcome.result.value, reverseDestinationNetwork, observedConnections: input.observedConnections.get(outcome.h1.airportCode.trim().toUpperCase()) ?? [] });
    twoStopPairCandidateProcessingMs += elapsedMs(pairProcessingStartedAt);
    h2Candidates.push({ h1: outcome.h1.airportCode, candidates });
    preparedH1.push({ h1: outcome.h1, firstLeg: outcome.firstLeg, h1ArrivalDate: outcome.h1ArrivalDate, candidates });
  }
  const preparedByH1 = new Map(preparedH1.map((entry) => [entry.h1.airportCode, entry]));
  const pairSchedule = buildRoundRobinPairSchedule(preparedH1.map((entry) => ({ h1: entry.h1, candidates: entry.candidates })));
  const twoStopNetworkDiscoveryWallMs = elapsedMs(networkDiscoveryStartedAt);
  const pairValidationStartedAt = nowMs();
  let twoStopPairValidationWaves = 0;
  const validatePair = async ({ h1, h2 }: { h1: TwoStopH1Candidate; h2: TwoStopH2Candidate }): Promise<VerifiedTwoStopRoute | undefined> => {
    const prepared = preparedByH1.get(h1.airportCode);
    if (!prepared) return undefined;
    try {
      const middleCalendarStartedAt = nowMs();
      const middleStart = addCalendarDays(prepared.h1ArrivalDate, MIN_TWO_STOP_STAY_NIGHTS);
      const middleEnd = input.arriveByDate && input.arriveByDate < addCalendarDays(prepared.h1ArrivalDate, MAX_TWO_STOP_STAY_NIGHTS) ? input.arriveByDate : addCalendarDays(prepared.h1ArrivalDate, MAX_TWO_STOP_STAY_NIGHTS);
      if (middleEnd < middleStart) return undefined;
      const middleCalendar = await runCachedFlightCalendar({
        key: buildFlightCalendarCacheKey({ origin: h1.airportCode, destination: h2.airportCode, startDate: middleStart, endDate: middleEnd, stopPolicy: "nonstop" }), cache: flightCalendarCache,
        load: () => dependencies.flightCalendarProvider.getFlightCalendar({ origin: h1.airportCode, destination: h2.airportCode, departureWindow: { start: middleStart, end: middleEnd }, stopPolicy: "nonstop" }), warn,
      });
      twoStopCalendarWallMs += elapsedMs(middleCalendarStartedAt);
      recordStageCache("calendar", middleCalendar.cacheStatus, "middleCalendarCalls");
      const middleDate = selectCalendarDate(prepared.h1ArrivalDate, middleCalendar.value, input.arriveByDate);
      if (!middleDate) return undefined;
      const middleDetailedStartedAt = nowMs();
      const middleResult = await runCachedFlightOffers({
        key: buildFlightOffersCacheKey({ origin: h1.airportCode, destination: h2.airportCode, departureDate: middleDate.departureDate, adults: input.adults }), cache: flightOffersCache,
        load: () => dependencies.flightProvider.searchOneWay({ origin: h1.airportCode, destination: h2.airportCode, departureWindow: { start: middleDate.departureDate, end: middleDate.departureDate }, adults: input.adults }), warn,
      });
      twoStopDetailedWallMs += elapsedMs(middleDetailedStartedAt);
      recordStageCache("detailed", middleResult.cacheStatus, "middleDetailedCalls");
      const middleLeg = selectNonstopOffer(middleResult.value, h1.airportCode, h2.airportCode, middleDate.departureDate);
      const h2ArrivalDate = middleLeg ? localDate(middleLeg.arrivalAt) : undefined;
      if (!middleLeg || !h2ArrivalDate) return undefined;
      const finalCalendarStartedAt = nowMs();
      const finalStart = addCalendarDays(h2ArrivalDate, MIN_TWO_STOP_STAY_NIGHTS);
      const finalEnd = input.arriveByDate && input.arriveByDate < addCalendarDays(h2ArrivalDate, MAX_TWO_STOP_STAY_NIGHTS) ? input.arriveByDate : addCalendarDays(h2ArrivalDate, MAX_TWO_STOP_STAY_NIGHTS);
      if (finalEnd < finalStart) return undefined;
      const finalCalendar = await runCachedFlightCalendar({
        key: buildFlightCalendarCacheKey({ origin: h2.airportCode, destination, startDate: finalStart, endDate: finalEnd, stopPolicy: "nonstop" }), cache: flightCalendarCache,
        load: () => dependencies.flightCalendarProvider.getFlightCalendar({ origin: h2.airportCode, destination, departureWindow: { start: finalStart, end: finalEnd }, stopPolicy: "nonstop" }), warn,
      });
      twoStopCalendarWallMs += elapsedMs(finalCalendarStartedAt);
      recordStageCache("calendar", finalCalendar.cacheStatus, "finalCalendarCalls");
      const finalDate = selectCalendarDate(h2ArrivalDate, finalCalendar.value, input.arriveByDate);
      if (!finalDate) return undefined;
      const finalDetailedStartedAt = nowMs();
      const finalResult = await runCachedFlightOffers({
        key: buildFlightOffersCacheKey({ origin: h2.airportCode, destination, departureDate: finalDate.departureDate, adults: input.adults }), cache: flightOffersCache,
        load: () => dependencies.flightProvider.searchOneWay({ origin: h2.airportCode, destination, departureWindow: { start: finalDate.departureDate, end: finalDate.departureDate }, adults: input.adults }), warn,
      });
      twoStopDetailedWallMs += elapsedMs(finalDetailedStartedAt);
      recordStageCache("detailed", finalResult.cacheStatus, "finalDetailedCalls");
      const finalLeg = selectNonstopOffer(finalResult.value, h2.airportCode, destination, finalDate.departureDate);
      if (!finalLeg || !hasMeaningfulStopover(prepared.firstLeg, middleLeg) || !hasMeaningfulStopover(middleLeg, finalLeg) || !arrivesByDate(finalLeg, input.arriveByDate)) return undefined;
      const h1StayNights = calculateHubStayNights(prepared.firstLeg, middleLeg);
      const h2StayNights = calculateHubStayNights(middleLeg, finalLeg);
      if (h1StayNights < MIN_TWO_STOP_STAY_NIGHTS || h1StayNights > MAX_TWO_STOP_STAY_NIGHTS || h2StayNights < MIN_TWO_STOP_STAY_NIGHTS || h2StayNights > MAX_TWO_STOP_STAY_NIGHTS) return undefined;
      const price = totalPrice([prepared.firstLeg, middleLeg, finalLeg]);
      if (!price) { failures.push(`${h1.airportCode} → ${h2.airportCode}: leg currencies differ.`); return undefined; }
      const route: VerifiedTwoStopRoute = { h1, h2, firstLeg: prepared.firstLeg, middleLeg, finalLeg, h1StayNights, h2StayNights, totalPrice: price, totalDuration: prepared.firstLeg.durationMinutes + middleLeg.durationMinutes + finalLeg.durationMinutes, scoreBreakdown: { price: 0, duration: 0, stops: 0, detour: 0, stay: 0, final: 0 }, score: 0 };
      dependencies.onItineraryVerified?.(createItinerary({ origin, destination, score: route.score, legs: [
        { flight: route.firstLeg, stopoverAfter: { airportCode: route.h1.airportCode, city: route.h1.city, country: route.h1.country, nights: route.h1StayNights } },
        { flight: route.middleLeg, stopoverAfter: { airportCode: route.h2.airportCode, city: route.h2.city, country: route.h2.country, nights: route.h2StayNights } },
        { flight: route.finalLeg },
      ] }));
      return route;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown optional two-stop failure.";
      warn(`Two-stop pair failed for ${h1.airportCode} → ${h2.airportCode}: ${message}`);
      failures.push(`${h1.airportCode} → ${h2.airportCode}: ${message}`);
      return undefined;
    }
  };
  const runPairWave = async (wave: Array<{ h1: TwoStopH1Candidate; h2: TwoStopH2Candidate }>) => {
    if (wave.length === 0) return;
    twoStopPairValidationWaves += 1;
    attemptedPairs += wave.length;
    const outcomes = await Promise.all(wave.map(validatePair));
    // Promise.all retains schedule order, so tie-sensitive downstream sorting
    // cannot be affected by which provider response completed first.
    verified.push(...outcomes.flatMap((route) => route ? [route] : []));
  };
  const firstWave: Array<{ h1: TwoStopH1Candidate; h2: TwoStopH2Candidate }> = [];
  const firstWaveH1s = new Set<string>();
  for (const pair of pairSchedule) {
    if (firstWaveH1s.has(pair.h1.airportCode)) break;
    firstWave.push(pair);
    firstWaveH1s.add(pair.h1.airportCode);
  }
  await runPairWave(firstWave);
  let nextPairIndex = firstWave.length;
  while (verified.length < input.targetResults && nextPairIndex < pairSchedule.length) {
    // Every attempt in this wave is required even under the prior sequential
    // target-aware execution: fewer than `needed` successes cannot finish.
    const needed = input.targetResults - verified.length;
    const wave = pairSchedule.slice(nextPairIndex, nextPairIndex + Math.min(needed, pairSchedule.length - nextPairIndex));
    await runPairWave(wave);
    nextPairIndex += wave.length;
  }
  const twoStopPairValidationWallMs = elapsedMs(pairValidationStartedAt);
  const rankedRoutes = scoreRoutes(verified).slice(0, input.targetResults);
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
    h1Candidates, h2Candidates,
    pairAttemptSchedule: pairSchedule.map((entry) => ({ h1: entry.h1.airportCode, h2: entry.h2.airportCode })),
    attemptedPairs, failures, technicalFailureCount, api,
    timing: {
      twoStopH1SelectionMs,
      twoStopNetworkDiscoveryWallMs,
      twoStopExploreWallMs: Number(twoStopExploreWallMs.toFixed(2)),
      twoStopExploreRequests: stageCache.explore.length,
      twoStopExploreLiveRequests: stageCache.explore.filter((status) => status === "MISS").length,
      twoStopExploreCacheHits: stageCache.explore.filter((status) => status === "HIT").length,
      twoStopPairCandidateProcessingMs: Number(twoStopPairCandidateProcessingMs.toFixed(2)),
      twoStopPairValidationWallMs,
      twoStopPairValidationWaves,
      twoStopCalendarWallMs: Number(twoStopCalendarWallMs.toFixed(2)),
      twoStopCalendarRequests: stageCache.calendar.length,
      twoStopCalendarLiveRequests: stageCache.calendar.filter((status) => status === "MISS").length,
      twoStopCalendarCacheHits: stageCache.calendar.filter((status) => status === "HIT").length,
      twoStopDetailedWallMs: Number(twoStopDetailedWallMs.toFixed(2)),
      twoStopDetailedRequests: stageCache.detailed.length,
      twoStopDetailedLiveRequests: stageCache.detailed.filter((status) => status === "MISS").length,
      twoStopDetailedCacheHits: stageCache.detailed.filter((status) => status === "HIT").length,
    },
  };
}
