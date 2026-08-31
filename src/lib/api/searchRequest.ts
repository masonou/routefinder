import {
  buildSearchCacheKey,
  getSearchCache,
  getSearchCacheResponseHeaders,
  runCachedSearch,
} from "../cache/searchCache.ts";
import { searchDynamicRoutes } from "../planner/searchDynamicRoutes.ts";
import { normalizeSearchApiError } from "../providers/searchApi.ts";
import {
  SearchValidationError,
  toTripRequest,
  validateSearchApiBody,
} from "../utils/searchValidation.ts";
import type { SearchCache } from "../cache/searchCache.ts";
import type { Itinerary } from "../../types/itinerary.ts";
import type { TripRequest } from "../../types/trip.ts";

type DynamicSearchFunction = (request: TripRequest) => Promise<Itinerary[]>;

export interface SearchRequestDependencies {
  cache?: SearchCache | null;
  searchDynamicRoutes?: DynamicSearchFunction;
}

export type SearchRequestResult =
  | {
      status: 200;
      body: { count: number; itineraries: Itinerary[] };
      headers: Record<string, string>;
    }
  | { status: 400 | 500; body: { error: string } };

export async function runSearchRequest(
  request: Request,
  dependencies: SearchRequestDependencies = {}
): Promise<SearchRequestResult> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { status: 400, body: { error: "Invalid JSON." } };
  }

  try {
    const searchRequest = validateSearchApiBody(body);
    const tripRequest = toTripRequest(searchRequest);
    const cache = dependencies.cache === undefined ? getSearchCache() : dependencies.cache;
    const searchResult = await runCachedSearch({
      key: buildSearchCacheKey(searchRequest),
      cache,
      async load() {
        const itineraries = await (dependencies.searchDynamicRoutes ?? searchDynamicRoutes)(
          tripRequest,
        );
        return { count: itineraries.length, itineraries };
      },
    });

    return {
      status: 200,
      body: searchResult.value,
      headers: getSearchCacheResponseHeaders(searchResult.cacheStatus),
    };
  } catch (error) {
    if (error instanceof SearchValidationError) {
      return { status: 400, body: { error: error.message } };
    }

    const normalizedError = normalizeSearchApiError(error);
    return {
      status: 500,
      body: {
        error:
          normalizedError.status === 429
            ? "Flight search is temporarily busy. Please try again."
            : "Flight search is currently unavailable. Please try again.",
      },
    };
  }
}
