import { planTrip } from "../planner/planTrip.ts";
import {
  SearchApiFlightProvider,
  normalizeSearchApiError,
} from "../providers/searchApi.ts";
import {
  SearchValidationError,
  createSearchRequestFromFormValues,
  toTripRequest,
} from "../utils/searchValidation.ts";
import { getDevelopmentEndpointUnavailableStatus } from "./developmentEndpoint.ts";
import type { FlightProvider } from "../providers/types.ts";
import type { Itinerary } from "../../types/itinerary.ts";
import type { TripRequest } from "../../types/trip.ts";

const DEFAULTS = {
  origin: "BNE",
  destination: "LCA",
  earliestDeparture: "2026-08-17",
  adults: 1,
} as const;

type PlannerFunction = (
  request: TripRequest,
  provider: FlightProvider
) => Promise<Itinerary[]>;

export interface SearchApiPlannerExampleDependencies {
  nodeEnvironment?: "development" | "production" | "test";
  planTrip?: PlannerFunction;
  createProvider?: (onRequest: () => void) => FlightProvider;
}

interface SearchApiPlannerExampleSuccess {
  provider: "searchapi";
  request: {
    origin: string;
    destination: string;
    earliestDeparture: string;
    departureWindow: TripRequest["departureWindow"];
    adults: number;
  };
  count: number;
  itineraries: Itinerary[];
  diagnostics: {
    providerRequests: number;
  };
}

interface SearchApiPlannerExampleFailure {
  error: string;
}

export type SearchApiPlannerExampleResult =
  | { status: 404 }
  | { status: number; body: SearchApiPlannerExampleSuccess | SearchApiPlannerExampleFailure };

function getQueryValue(value: string | null, fallback: string): string {
  return value?.trim() || fallback;
}

function getAdults(value: string | null): number {
  const normalized = value?.trim();
  return normalized ? Number(normalized) : DEFAULTS.adults;
}

export async function runSearchApiPlannerExample(
  request: Request,
  dependencies: SearchApiPlannerExampleDependencies = {}
): Promise<SearchApiPlannerExampleResult> {
  const unavailableStatus = getDevelopmentEndpointUnavailableStatus(
    dependencies.nodeEnvironment
  );
  if (unavailableStatus) {
    return { status: unavailableStatus };
  }

  const query = new URL(request.url).searchParams;
  let tripRequest: TripRequest;
  let earliestDeparture: string;

  try {
    const publicRequest = createSearchRequestFromFormValues(
      {
        origin: getQueryValue(query.get("origin"), DEFAULTS.origin),
        destination: getQueryValue(query.get("destination"), DEFAULTS.destination),
        earliestDeparture: getQueryValue(
          query.get("earliestDeparture"),
          DEFAULTS.earliestDeparture
        ),
      },
      getAdults(query.get("adults"))
    );
    earliestDeparture = publicRequest.earliestDeparture;
    tripRequest = toTripRequest(publicRequest);
  } catch (error) {
    const message =
      error instanceof SearchValidationError
        ? error.message
        : "Invalid SearchAPI planner example query.";
    return { status: 400, body: { error: message } };
  }

  let providerRequests = 0;
  const provider =
    dependencies.createProvider?.(() => {
      providerRequests += 1;
    }) ??
    new SearchApiFlightProvider({
      onRequest: () => {
        providerRequests += 1;
      },
    });

  try {
    const itineraries = await (dependencies.planTrip ?? planTrip)(tripRequest, provider);

    return {
      status: 200,
      body: {
        provider: "searchapi",
        request: {
          origin: tripRequest.origin,
          destination: tripRequest.destination,
          earliestDeparture,
          departureWindow: tripRequest.departureWindow,
          adults: tripRequest.adults ?? DEFAULTS.adults,
        },
        count: itineraries.length,
        itineraries,
        diagnostics: {
          providerRequests,
        },
      },
    };
  } catch (error) {
    const normalizedError = normalizeSearchApiError(error);
    const status =
      normalizedError.status !== undefined &&
      normalizedError.status >= 400 &&
      normalizedError.status < 600
        ? normalizedError.status
        : 500;
    return { status, body: { error: normalizedError.message } };
  }
}
