import {
  buildDirectDestinationsCacheKey,
  getDirectDestinationsCache,
  runCachedDirectDestinations,
  type DirectDestinationsCache,
} from "../cache/directDestinationsCache.ts";
import type { FlightCalendarCache } from "../cache/flightCalendarCache.ts";
import type { FlightOffersCache } from "../cache/flightOffersCache.ts";
import {
  DEPARTURE_FLEX_DAYS,
  MAX_ONE_STOP_RESULTS,
  MAX_TWO_STOP_RESULTS,
  MAX_VERIFIED_HUBS,
  TWO_STOP_MIN_DIRECT_DISTANCE_KM,
} from "../constants/planner.ts";
import {
  searchApiDirectDestinationsProvider,
  searchApiFlightCalendarProvider,
  searchApiFlightProvider,
  normalizeSearchApiError,
} from "../providers/searchApi.ts";
import type {
  DirectDestinationsProvider,
  FlightCalendarProvider,
  FlightProvider,
} from "../providers/types.ts";
import { selectDiverseItineraries } from "./deduplicateItineraries.ts";
import {
  generateHubCandidates,
  selectCalendarCandidateVariants,
  type HubCandidate,
} from "./hubCandidates.ts";
import {
  validateHubCandidates,
  type ValidatedHubCandidate,
} from "./validateHubCandidates.ts";
import {
  rankVerifiedRoutes,
  verifyHubCandidates,
  type DetailedVerificationFailure,
  type DetailedVerificationLookup,
  type DetailedVerificationRejection,
  type DetailedOfferTrace,
  type VerifyHubCandidatesOptions,
  type VerifiedHubRoute,
} from "./verifyHubCandidates.ts";
import { createItinerary, type Itinerary } from "../../types/itinerary.ts";
import type { TripRequest } from "../../types/trip.ts";
import { addCalendarDays, enumerateDateWindow } from "../utils/dateWindow.ts";
import { discoverDirectItinerary } from "./discoverDirectRoute.ts";
import { FatalSearchStageError } from "./fatalStageFailure.ts";
import { partitionOneStopAdventures } from "./adventurePortfolio.ts";
import {
  discoverTwoStopRoutes,
  observedConnectionsByH1,
  shouldExploreTwoStopovers,
} from "./discoverTwoStopRoutes.ts";
import { findAirportByCode } from "../../data/airports.ts";
import { distanceKm } from "../utils/geography.ts";
import type {
  DynamicSearchResult,
  TwoStopDiscoveryMetadata,
} from "../../types/search.ts";
import {
  countCacheStatuses,
  elapsedMs,
  emptyRequestTiming,
  nowMs,
  type RequestTiming,
} from "../instrumentation/searchTiming.ts";
import type { DirectRouteTiming } from "./discoverDirectRoute.ts";

type WarningFunction = (message: string) => void;

export interface DynamicSearchDependencies {
  directDestinationsProvider?: DirectDestinationsProvider;
  flightCalendarProvider?: FlightCalendarProvider;
  flightProvider?: FlightProvider;
  directDestinationsCache?: DirectDestinationsCache | null;
  flightCalendarCache?: FlightCalendarCache | null;
  flightOffersCache?: FlightOffersCache | null;
  warn?: WarningFunction;
}

export interface DynamicSearchOptions {
  /** Explicitly bypasses only the full one-stop portfolio optimisation. */
  forceTwoStop?: boolean;
}

export interface ExploreDiscoveryResult {
  departureDate: string;
  directDestinationCount?: number;
  candidateCount?: number;
  hubCodes?: string[];
  cacheStatus?: "HIT" | "MISS";
  error?: string;
}

export interface FlexibleHubDiscoveryResult {
  departureDates: string[];
  exploreResults: ExploreDiscoveryResult[];
  candidates: HubCandidate[];
  calendarCandidates: HubCandidate[];
  failures: { departureDate: string; message: string }[];
  timing: Pick<RequestTiming, "exploreWallMs" | "exploreRequests" | "exploreLiveRequests" | "exploreCacheHits" | "stage1ProcessingMs">;
}

export function toDynamicItinerary(route: VerifiedHubRoute): Itinerary {
  return createItinerary({
    origin: route.firstLeg.origin,
    destination: route.secondLeg.destination,
    legs: [
      {
        flight: route.firstLeg,
        stopoverAfter: {
          airportCode: route.hub.airportCode,
          city: route.hub.city,
          country: route.hub.country,
          nights: route.hubStayNights,
        },
      },
      { flight: route.secondLeg },
    ],
    score: route.score,
  });
}

export function appendDirectBaseline(
  adventures: Itinerary[],
  directItinerary: Itinerary | undefined,
): Itinerary[] {
  if (!directItinerary) return adventures;
  // The reference route never competes with or displaces an adventure.
  return [directItinerary, ...adventures];
}

export function orderAdventureItineraries(routes: VerifiedHubRoute[]): Itinerary[] {
  const clean = routes.filter((route) => route.onwardPolicy === "nonstop");
  const connectingFallback = routes.filter(
    (route) => route.onwardPolicy === "connecting_fallback",
  );
  // Diversity selection is intentionally run per product category so its
  // score-based sort cannot let a connecting route leapfrog a clean adventure.
  return [
    ...selectDiverseItineraries(clean.map(toDynamicItinerary), MAX_ONE_STOP_RESULTS),
    ...selectDiverseItineraries(
      connectingFallback.map(toDynamicItinerary),
      MAX_ONE_STOP_RESULTS,
    ),
  ].slice(0, MAX_ONE_STOP_RESULTS);
}

function throwIfAllStageRequestsFailed(
  stage: "calendar" | "detailed",
  candidateCount: number,
  failures: { cause: ReturnType<typeof normalizeSearchApiError> }[],
): void {
  if (candidateCount > 0 && failures.length === candidateCount) {
    throw new FatalSearchStageError(stage, failures.map((failure) => failure.cause));
  }
}

export interface DetailedVerificationRun {
  verifiedRoutes: VerifiedHubRoute[];
  failures: DetailedVerificationFailure[];
  rejected: DetailedVerificationRejection[];
  detailedLookups: DetailedVerificationLookup[];
  attemptedCandidates: number;
}

function candidateKey(candidate: Pick<ValidatedHubCandidate, "airportCode" | "firstLegDepartureDate">): string {
  return `${candidate.airportCode.trim().toUpperCase()}:${candidate.firstLegDepartureDate}`;
}

export async function verifyCandidatesUntilFilled(
  input: Pick<TripRequest, "origin" | "destination" | "adults">,
  candidates: ValidatedHubCandidate[],
  slots: number,
  initialVerifiedHubs: Set<string>,
  provider: FlightProvider,
  options: Pick<DynamicSearchDependencies, "flightOffersCache" | "warn"> &
    Pick<VerifyHubCandidatesOptions, "onDetailedOffers">,
): Promise<DetailedVerificationRun> {
  const verifiedRoutes: VerifiedHubRoute[] = [];
  const failures: DetailedVerificationFailure[] = [];
  const rejected: DetailedVerificationRejection[] = [];
  const detailedLookups: DetailedVerificationLookup[] = [];
  const attempted = new Set<string>();
  const verifiedHubs = new Set(initialVerifiedHubs);

  while (verifiedRoutes.length < slots) {
    const batch: ValidatedHubCandidate[] = [];
    const batchHubs = new Set<string>();
    const batchSize = slots - verifiedRoutes.length;

    for (const candidate of candidates) {
      const key = candidateKey(candidate);
      const hub = candidate.airportCode.trim().toUpperCase();
      if (attempted.has(key) || verifiedHubs.has(hub) || batchHubs.has(hub)) continue;
      batch.push(candidate);
      batchHubs.add(hub);
      if (batch.length === batchSize) break;
    }

    if (batch.length === 0) break;
    batch.forEach((candidate) => attempted.add(candidateKey(candidate)));

    const result = await verifyHubCandidates(
      { ...input, candidates: batch },
      provider,
      {
        cache: options.flightOffersCache,
        warn: options.warn,
        onDetailedOffers: options.onDetailedOffers,
        throwOnAllFailures: false,
      },
    );
    verifiedRoutes.push(...result.verifiedRoutes);
    failures.push(...result.failures);
    rejected.push(...result.rejected);
    detailedLookups.push(...result.detailedLookups);
    result.verifiedRoutes.forEach((route) =>
      verifiedHubs.add(route.hub.airportCode.trim().toUpperCase()),
    );
  }

  return {
    verifiedRoutes,
    failures,
    rejected,
    detailedLookups,
    attemptedCandidates: attempted.size,
  };
}

export function getInitialDepartureDates(earliestDeparture: string): string[] {
  return enumerateDateWindow({
    start: earliestDeparture,
    end: addCalendarDays(earliestDeparture, DEPARTURE_FLEX_DAYS),
  });
}

export async function discoverFlexibleHubCandidates(
  input: Pick<TripRequest, "origin" | "destination"> & { earliestDeparture: string },
  dependencies: Pick<
    DynamicSearchDependencies,
    "directDestinationsProvider" | "directDestinationsCache" | "warn"
  > = {},
): Promise<FlexibleHubDiscoveryResult> {
  const directDestinationsProvider =
    dependencies.directDestinationsProvider ?? searchApiDirectDestinationsProvider;
  const cache =
    dependencies.directDestinationsCache === undefined
      ? getDirectDestinationsCache()
      : dependencies.directDestinationsCache;
  const warn = dependencies.warn ?? console.warn;
  const departureDates = getInitialDepartureDates(input.earliestDeparture);

  const exploreStartedAt = nowMs();
  const exploreResults = await Promise.all(
    departureDates.map(async (departureDate): Promise<ExploreDiscoveryResult & {
      candidates?: HubCandidate[];
      stage1ProcessingMs?: number;
      cause?: ReturnType<typeof normalizeSearchApiError>;
    }> => {
      try {
        const result = await runCachedDirectDestinations({
          key: buildDirectDestinationsCacheKey({
            origin: input.origin,
            departureDate,
          }),
          cache,
          load: () =>
            directDestinationsProvider.getDirectDestinations({
              origin: input.origin,
              departureDate,
            }),
          warn,
        });
        const stage1StartedAt = nowMs();
        const candidates = await generateHubCandidates(
          { origin: input.origin, destination: input.destination, departureDate },
          { getDirectDestinations: async () => result.value },
        );
        return {
          departureDate,
          directDestinationCount: result.value.length,
          candidateCount: candidates.length,
          hubCodes: [...new Set(candidates.map((candidate) => candidate.airportCode))],
          cacheStatus: result.cacheStatus,
          candidates,
          stage1ProcessingMs: elapsedMs(stage1StartedAt),
        };
      } catch (error) {
        const cause = normalizeSearchApiError(error);
        const message = cause.message;
        warn(`Travel Explore failed for ${departureDate}: ${message}`);
        return { departureDate, error: message, cause };
      }
    }),
  );
  const exploreWallMs = elapsedMs(exploreStartedAt);
  const failures = exploreResults
    .filter((result) => result.error !== undefined)
    .map(({ departureDate, error }) => ({
      departureDate,
      message: error as string,
    }));

  if (failures.length === departureDates.length) {
    throw new FatalSearchStageError(
      "explore",
      exploreResults.flatMap((result) => result.cause ? [result.cause] : []),
    );
  }

  // This is local CPU time only. Candidate work already runs in the existing
  // Explore promise branch, so recording it here does not move or serialize it.
  const stage1ProcessingMs = Number(exploreResults.reduce(
    (sum, result) => sum + ("stage1ProcessingMs" in result ? result.stage1ProcessingMs ?? 0 : 0), 0,
  ).toFixed(2));
  const candidates = exploreResults.flatMap((result) => ("candidates" in result ? result.candidates ?? [] : []));
  const exploreCounts = countCacheStatuses(
    exploreResults.flatMap((result) => result.cacheStatus ? [{ cacheStatus: result.cacheStatus }] : []),
  );
  return {
    departureDates,
    exploreResults: exploreResults.map((result) => ({
      departureDate: result.departureDate,
      ...(result.directDestinationCount === undefined
        ? {}
        : { directDestinationCount: result.directDestinationCount }),
      ...(result.candidateCount === undefined
        ? {}
        : { candidateCount: result.candidateCount }),
      ...(result.hubCodes === undefined ? {} : { hubCodes: result.hubCodes }),
      ...(result.cacheStatus === undefined ? {} : { cacheStatus: result.cacheStatus }),
      ...(result.error === undefined ? {} : { error: result.error }),
    })),
    candidates,
    calendarCandidates: selectCalendarCandidateVariants(candidates),
    failures,
    timing: { exploreWallMs, ...exploreCounts, stage1ProcessingMs },
  };
}

function twoStopUnavailableForDistance(directDistanceKm: number): TwoStopDiscoveryMetadata {
  return directDistanceKm < TWO_STOP_MIN_DIRECT_DISTANCE_KM
    ? { explored: false, canExplore: false, reason: "route_too_short" }
    : { explored: false, canExplore: false, reason: "unavailable" };
}

/**
 * Runs the planner and returns its generic itinerary portfolio plus the small
 * search-level state needed to offer an optional two-stop expansion.
 */
export async function searchDynamicRoutePortfolio(
  request: TripRequest,
  options: DynamicSearchOptions = {},
  dependencies: DynamicSearchDependencies = {},
): Promise<DynamicSearchResult> {
  const timing = emptyRequestTiming();
  timing.twoStopForced = options.forceTwoStop === true;
  const flightCalendarProvider =
    dependencies.flightCalendarProvider ?? searchApiFlightCalendarProvider;
  const flightProvider = dependencies.flightProvider ?? searchApiFlightProvider;
  const warn = dependencies.warn ?? console.warn;
  const originAirport = findAirportByCode(request.origin);
  const destinationAirport = findAirportByCode(request.destination);
  const directDistanceKm = originAirport && destinationAirport
    ? distanceKm(originAirport, destinationAirport)
    : 0;
  // The direct baseline is independent from hub exploration and intentionally
  // continues in parallel with the adventure pipeline.
  let directTiming: DirectRouteTiming | undefined;
  const directItineraryPromise = discoverDirectItinerary(
    {
      origin: request.origin,
      destination: request.destination,
      earliestDeparture: request.departureWindow.start,
      adults: request.adults,
    },
    {
      flightCalendarProvider,
      flightProvider,
      calendarCache: dependencies.flightCalendarCache,
      flightOffersCache: dependencies.flightOffersCache,
      warn,
      onTiming: (value) => { directTiming = value; },
    },
  );
  const discovery = await discoverFlexibleHubCandidates(
    {
      origin: request.origin,
      destination: request.destination,
      earliestDeparture: request.departureWindow.start,
    },
    {
      directDestinationsProvider: dependencies.directDestinationsProvider,
      directDestinationsCache: dependencies.directDestinationsCache,
      warn,
    },
  );
  Object.assign(timing, discovery.timing);
  const candidates = discovery.calendarCandidates;
  if (candidates.length === 0) {
    const directItinerary = await directItineraryPromise;
    const itineraries = appendDirectBaseline([], directItinerary);
    return {
      count: itineraries.length,
      itineraries,
      twoStopDiscovery: twoStopUnavailableForDistance(directDistanceKm),
      timing: refreshProviderCounts(applyDirectTiming(timing, directTiming)),
    };
  }

  const cleanCalendarStartedAt = nowMs();
  const cleanValidation = await validateHubCandidates(
    { candidates, destination: request.destination },
    flightCalendarProvider,
    { cache: dependencies.flightCalendarCache, warn, mode: "clean" },
  );
  timing.cleanCalendarWallMs = elapsedMs(cleanCalendarStartedAt);
  Object.assign(timing, prefixCounts("cleanCalendar", countCacheStatuses(cleanValidation.calendarLookups)));
  throwIfAllStageRequestsFailed(
    "calendar",
    Math.min(candidates.length, 8),
    cleanValidation.failures,
  );
  const detailedTraces: DetailedOfferTrace[] = [];
  const cleanDetailedStartedAt = nowMs();
  const cleanVerification = await verifyCandidatesUntilFilled(
    request,
    cleanValidation.topCandidates,
    MAX_VERIFIED_HUBS,
    new Set(),
    flightProvider,
    {
      flightOffersCache: dependencies.flightOffersCache,
      warn,
      onDetailedOffers: (trace) => detailedTraces.push(trace),
    },
  );
  timing.cleanDetailedWallMs = elapsedMs(cleanDetailedStartedAt);
  Object.assign(timing, prefixCounts("cleanDetailed", countCacheStatuses(cleanVerification.detailedLookups)));
  const cleanVerifiedHubs = new Set(
    cleanVerification.verifiedRoutes.map((route) => route.hub.airportCode.trim().toUpperCase()),
  );
  const remainingSlots = MAX_VERIFIED_HUBS - cleanVerification.verifiedRoutes.length;
  const fallbackPool = candidates.filter(
    (candidate) => !cleanVerifiedHubs.has(candidate.airportCode.trim().toUpperCase()),
  );
  timing.fallbackTriggered = remainingSlots > 0;
  const fallbackCalendarStartedAt = nowMs();
  const fallbackValidation = remainingSlots > 0
    ? await validateHubCandidates(
      { candidates: fallbackPool, destination: request.destination },
      flightCalendarProvider,
      { cache: dependencies.flightCalendarCache, warn, mode: "fallback" },
    )
    : undefined;
  if (fallbackValidation) {
    timing.fallbackCalendarWallMs = elapsedMs(fallbackCalendarStartedAt);
    Object.assign(timing, prefixCounts("fallbackCalendar", countCacheStatuses(fallbackValidation.calendarLookups)));
  }
  const fallbackDetailedStartedAt = nowMs();
  const fallbackVerification = fallbackValidation
    ? await verifyCandidatesUntilFilled(
      request,
      fallbackValidation.validatedCandidates,
      remainingSlots,
      cleanVerifiedHubs,
      flightProvider,
      {
        flightOffersCache: dependencies.flightOffersCache,
        warn,
        onDetailedOffers: (trace) => detailedTraces.push(trace),
      },
    )
    : {
      verifiedRoutes: [],
      failures: [],
      rejected: [],
      detailedLookups: [],
      attemptedCandidates: 0,
    };
  if (fallbackValidation) {
    timing.fallbackDetailedWallMs = elapsedMs(fallbackDetailedStartedAt);
    Object.assign(timing, prefixCounts("fallbackDetailed", countCacheStatuses(fallbackVerification.detailedLookups)));
  }

  const verifiedRoutes = [
    ...cleanVerification.verifiedRoutes,
    ...fallbackVerification.verifiedRoutes,
  ];
  const detailedFailures = [
    ...cleanVerification.failures,
    ...fallbackVerification.failures,
  ];
  const detailedAttempts =
    cleanVerification.attemptedCandidates + fallbackVerification.attemptedCandidates;
  if (
    verifiedRoutes.length === 0 &&
    detailedAttempts > 0 &&
    detailedFailures.length === detailedAttempts
  ) {
    throw new FatalSearchStageError(
      "detailed",
      detailedFailures.map((failure) => failure.cause),
    );
  }

  // The one-stop portfolio is finalized before the optional two-stop branch is
  // considered. Its candidate limits, scoring, and ordering remain untouched.
  const oneStopAdventures = orderAdventureItineraries(rankVerifiedRoutes(verifiedRoutes).verifiedRoutes);
  const oneStopPortfolio = partitionOneStopAdventures(oneStopAdventures);
  const twoStopEligibility = shouldExploreTwoStopovers({
    directDistanceKm,
    cleanOneStopAdventureCount: oneStopPortfolio.clean.length,
  });
  const forcePortfolioFull = options.forceTwoStop === true &&
    twoStopEligibility.reason === "portfolio_full";
  const shouldRunTwoStopDiscovery = twoStopEligibility.eligible || forcePortfolioFull;
  const twoStopDiscovery: TwoStopDiscoveryMetadata = shouldRunTwoStopDiscovery
    ? { explored: true, canExplore: false, reason: "already_explored" }
    : twoStopEligibility.reason === "portfolio_full"
      ? { explored: false, canExplore: true, reason: "portfolio_full" }
      : { explored: false, canExplore: false, reason: "route_too_short" };
  let twoStopAdventures: Itinerary[] = [];
  if (shouldRunTwoStopDiscovery) {
    timing.twoStopTriggered = true;
    const twoStopStartedAt = nowMs();
    // Capture existing detailed H1→destination evidence without changing how
    // the one-stop verifier selects an offer. This lets connections inform H2
    // discovery while Explore remains an independent source.
    try {
      const h1Candidates = [
        ...cleanValidation.validatedCandidates,
        ...(fallbackValidation?.validatedCandidates ?? []),
      ];
      const result = await discoverTwoStopRoutes(
        {
          origin: request.origin,
          destination: request.destination,
          adults: request.adults ?? 1,
          h1Candidates,
          observedConnections: observedConnectionsByH1(detailedTraces),
          targetResults: forcePortfolioFull
            ? MAX_TWO_STOP_RESULTS
            : twoStopEligibility.targetResults,
        },
        {
          directDestinationsProvider:
            dependencies.directDestinationsProvider ?? searchApiDirectDestinationsProvider,
          flightCalendarProvider,
          flightProvider,
          directDestinationsCache: dependencies.directDestinationsCache,
          flightCalendarCache: dependencies.flightCalendarCache,
          flightOffersCache: dependencies.flightOffersCache,
          warn,
        },
      );
      twoStopAdventures = result.itineraries;
      Object.assign(timing, result.timing);
      // The regular search treats two-stop exploration as supplementary. For
      // an explicit expansion, however, a total technical failure deserves a
      // structured response so the existing portfolio can remain on screen
      // with an inline retry affordance.
      if (
        options.forceTwoStop === true &&
        result.itineraries.length === 0 &&
        result.h1Candidates.length > 0 &&
        result.technicalFailureCount === result.h1Candidates.length
      ) {
        throw new Error("All forced two-stop discovery branches failed.");
      }
    } catch (error) {
      // Two-stop discovery is supplementary. A technical issue here must not
      // turn an otherwise useful direct/one-stop result into a failed search.
      warn(`Optional two-stop discovery failed: ${error instanceof Error ? error.message : "Unknown error."}`);
      if (options.forceTwoStop === true) throw error;
    } finally {
      timing.twoStopTotalMs = elapsedMs(twoStopStartedAt);
    }
  }
  const directItinerary = await directItineraryPromise;
  applyDirectTiming(timing, directTiming);
  refreshProviderCounts(timing);
  // Result categories are independent: a verified two-stop route never
  // displaces a verified one-stop route merely to satisfy a combined cap.
  const itineraries = appendDirectBaseline(
    [...oneStopAdventures, ...twoStopAdventures],
    directItinerary,
  );
  return { count: itineraries.length, itineraries, twoStopDiscovery, timing };
}

function prefixCounts(prefix: "cleanCalendar" | "cleanDetailed" | "fallbackCalendar" | "fallbackDetailed", counts: ReturnType<typeof countCacheStatuses>) {
  return {
    [`${prefix}Requests`]: counts.requests,
    [`${prefix}LiveRequests`]: counts.liveRequests,
    [`${prefix}CacheHits`]: counts.cacheHits,
  } as Partial<RequestTiming>;
}

function applyDirectTiming(timing: RequestTiming, direct: DirectRouteTiming | undefined): RequestTiming {
  if (!direct) return timing;
  timing.directCalendarMs = direct.calendarMs;
  timing.directDetailedMs = direct.detailedMs;
  timing.directTotalMs = direct.totalMs;
  timing.directCalendarLiveRequests = direct.calendarCacheStatus === "MISS" ? 1 : 0;
  timing.directCalendarCacheHits = direct.calendarCacheStatus === "HIT" ? 1 : 0;
  timing.directDetailedLiveRequests = direct.detailedCacheStatus === "MISS" ? 1 : 0;
  timing.directDetailedCacheHits = direct.detailedCacheStatus === "HIT" ? 1 : 0;
  return timing;
}

function refreshProviderCounts(timing: RequestTiming): RequestTiming {
  timing.providerLiveRequests = timing.exploreLiveRequests + timing.cleanCalendarLiveRequests + timing.cleanDetailedLiveRequests + timing.fallbackCalendarLiveRequests + timing.fallbackDetailedLiveRequests + timing.directCalendarLiveRequests + timing.directDetailedLiveRequests + timing.twoStopExploreLiveRequests + timing.twoStopCalendarLiveRequests + timing.twoStopDetailedLiveRequests;
  timing.providerCacheHits = timing.exploreCacheHits + timing.cleanCalendarCacheHits + timing.cleanDetailedCacheHits + timing.fallbackCalendarCacheHits + timing.fallbackDetailedCacheHits + timing.directCalendarCacheHits + timing.directDetailedCacheHits + timing.twoStopExploreCacheHits + timing.twoStopCalendarCacheHits + timing.twoStopDetailedCacheHits;
  return timing;
}

/** Backwards-compatible itinerary-only entry point for planner consumers. */
export async function searchDynamicRoutes(
  request: TripRequest,
  dependencies: DynamicSearchDependencies = {},
): Promise<Itinerary[]> {
  return (await searchDynamicRoutePortfolio(request, {}, dependencies)).itineraries;
}
