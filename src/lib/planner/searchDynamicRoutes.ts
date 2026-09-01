import {
  buildDirectDestinationsCacheKey,
  getDirectDestinationsCache,
  runCachedDirectDestinations,
  type DirectDestinationsCache,
} from "../cache/directDestinationsCache.ts";
import type { FlightCalendarCache } from "../cache/flightCalendarCache.ts";
import type { FlightOffersCache } from "../cache/flightOffersCache.ts";
import { DEPARTURE_FLEX_DAYS, MAX_VERIFIED_HUBS } from "../constants/planner.ts";
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
import { validateHubCandidates } from "./validateHubCandidates.ts";
import {
  verifyHubCandidates,
  type VerifiedHubRoute,
} from "./verifyHubCandidates.ts";
import { createItinerary, type Itinerary } from "../../types/itinerary.ts";
import type { TripRequest } from "../../types/trip.ts";
import { addCalendarDays, enumerateDateWindow } from "../utils/dateWindow.ts";
import { discoverDirectItinerary } from "./discoverDirectRoute.ts";
import { FatalSearchStageError } from "./fatalStageFailure.ts";

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
    ...selectDiverseItineraries(clean.map(toDynamicItinerary), MAX_VERIFIED_HUBS),
    ...selectDiverseItineraries(
      connectingFallback.map(toDynamicItinerary),
      MAX_VERIFIED_HUBS,
    ),
  ].slice(0, MAX_VERIFIED_HUBS);
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

  const exploreResults = await Promise.all(
    departureDates.map(async (departureDate): Promise<ExploreDiscoveryResult & {
      candidates?: HubCandidate[];
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
        const candidates = await generateHubCandidates(
          {
            origin: input.origin,
            destination: input.destination,
            departureDate,
          },
          { getDirectDestinations: async () => result.value },
        );

        return {
          departureDate,
          directDestinationCount: result.value.length,
          candidateCount: candidates.length,
          hubCodes: [...new Set(candidates.map((candidate) => candidate.airportCode))],
          cacheStatus: result.cacheStatus,
          candidates,
        };
      } catch (error) {
        const cause = normalizeSearchApiError(error);
        const message = cause.message;
        warn(`Travel Explore failed for ${departureDate}: ${message}`);
        return { departureDate, error: message, cause };
      }
    }),
  );
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

  const candidates = exploreResults.flatMap((result) => result.candidates ?? []);
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
  };
}

export async function searchDynamicRoutes(
  request: TripRequest,
  dependencies: DynamicSearchDependencies = {},
): Promise<Itinerary[]> {
  const flightCalendarProvider =
    dependencies.flightCalendarProvider ?? searchApiFlightCalendarProvider;
  const flightProvider = dependencies.flightProvider ?? searchApiFlightProvider;
  const warn = dependencies.warn ?? console.warn;
  // The direct baseline is independent from hub exploration and intentionally
  // continues in parallel with the adventure pipeline.
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
  const candidates = discovery.calendarCandidates;
  if (candidates.length === 0) {
    const directItinerary = await directItineraryPromise;
    return appendDirectBaseline([], directItinerary);
  }

  const validation = await validateHubCandidates(
    { candidates, destination: request.destination },
    flightCalendarProvider,
    { warn },
  );
  throwIfAllStageRequestsFailed(
    "calendar",
    Math.min(candidates.length, 8),
    validation.failures,
  );
  if (validation.topCandidates.length === 0) {
    const directItinerary = await directItineraryPromise;
    return appendDirectBaseline([], directItinerary);
  }

  const verification = await verifyHubCandidates(
    {
      origin: request.origin,
      destination: request.destination,
      candidates: validation.topCandidates,
      adults: request.adults,
    },
    flightProvider,
    { warn },
  );
  throwIfAllStageRequestsFailed(
    "detailed",
    validation.topCandidates.length,
    verification.failures,
  );

  const adventures = orderAdventureItineraries(verification.verifiedRoutes);
  const directItinerary = await directItineraryPromise;
  return appendDirectBaseline(adventures, directItinerary);
}
