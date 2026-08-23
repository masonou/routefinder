import {
  buildDirectDestinationsCacheKey,
  getDirectDestinationsCache,
  runCachedDirectDestinations,
  type DirectDestinationsCache,
} from "../cache/directDestinationsCache.ts";
import { MAX_RESULTS } from "../constants/planner.ts";
import {
  searchApiDirectDestinationsProvider,
  searchApiFlightCalendarProvider,
  searchApiFlightProvider,
} from "../providers/searchApi.ts";
import type {
  DirectDestinationsProvider,
  FlightCalendarProvider,
  FlightProvider,
} from "../providers/types.ts";
import { selectDiverseItineraries } from "./deduplicateItineraries.ts";
import { generateHubCandidates } from "./hubCandidates.ts";
import { validateHubCandidates } from "./validateHubCandidates.ts";
import {
  verifyHubCandidates,
  type VerifiedHubRoute,
} from "./verifyHubCandidates.ts";
import type { Itinerary } from "../../types/itinerary.ts";
import type { TripRequest } from "../../types/trip.ts";

type WarningFunction = (message: string) => void;

export interface DynamicSearchDependencies {
  directDestinationsProvider?: DirectDestinationsProvider;
  flightCalendarProvider?: FlightCalendarProvider;
  flightProvider?: FlightProvider;
  directDestinationsCache?: DirectDestinationsCache | null;
  warn?: WarningFunction;
}

export function toDynamicItinerary(route: VerifiedHubRoute): Itinerary {
  return {
    // Flight-offer IDs are provider-neutral stable identities; booking references
    // remain attached to the offers but are intentionally excluded from this ID.
    id: `${route.firstLeg.id}__${route.secondLeg.id}`,
    origin: route.firstLeg.origin,
    hub: route.hub.airportCode,
    destination: route.secondLeg.destination,
    firstLeg: route.firstLeg,
    secondLeg: route.secondLeg,
    hubStayNights: route.hubStayNights,
    totalPrice: route.totalPrice,
    totalFlightDurationMinutes: route.totalFlightDurationMinutes,
    totalStops: route.totalStops,
    score: route.score,
  };
}

function throwIfAllStageRequestsFailed(
  stage: "Calendar validation" | "Detailed verification",
  candidateCount: number,
  failures: { message: string }[],
): void {
  if (candidateCount > 0 && failures.length === candidateCount) {
    throw new Error(`${stage} failed for every candidate.`);
  }
}

// Dynamic discovery deliberately performs Explore only for departureWindow.start.
// The public D through D+3 window remains available to legacy rollback mode; adding
// four Explore searches would exceed this V1 request budget.
export async function searchDynamicRoutes(
  request: TripRequest,
  dependencies: DynamicSearchDependencies = {},
): Promise<Itinerary[]> {
  const directDestinationsProvider =
    dependencies.directDestinationsProvider ?? searchApiDirectDestinationsProvider;
  const flightCalendarProvider =
    dependencies.flightCalendarProvider ?? searchApiFlightCalendarProvider;
  const flightProvider = dependencies.flightProvider ?? searchApiFlightProvider;
  const cache =
    dependencies.directDestinationsCache === undefined
      ? getDirectDestinationsCache()
      : dependencies.directDestinationsCache;
  const warn = dependencies.warn ?? console.warn;
  const departureDate = request.departureWindow.start;

  const candidates = await generateHubCandidates(
    {
      origin: request.origin,
      destination: request.destination,
      departureDate,
    },
    {
      async getDirectDestinations(input) {
        const result = await runCachedDirectDestinations({
          key: buildDirectDestinationsCacheKey(input),
          cache,
          load: () => directDestinationsProvider.getDirectDestinations(input),
          warn,
        });
        return result.value;
      },
    },
  );
  if (candidates.length === 0) return [];

  const validation = await validateHubCandidates(
    { candidates, destination: request.destination },
    flightCalendarProvider,
    { warn },
  );
  throwIfAllStageRequestsFailed(
    "Calendar validation",
    Math.min(candidates.length, 8),
    validation.failures,
  );
  if (validation.topCandidates.length === 0) return [];

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
    "Detailed verification",
    validation.topCandidates.length,
    verification.failures,
  );

  return selectDiverseItineraries(
    verification.verifiedRoutes.map(toDynamicItinerary),
    MAX_RESULTS,
  );
}

export function isDynamicHubDiscoveryEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment.DYNAMIC_HUB_DISCOVERY_ENABLED?.trim().toLowerCase() === "true";
}
