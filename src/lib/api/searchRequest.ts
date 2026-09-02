import {
  buildSearchCacheKey,
  getSearchCache,
  getSearchCacheResponseHeaders,
  runCachedSearch,
} from "../cache/searchCache.ts";
import { searchDynamicRoutePortfolio } from "../planner/searchDynamicRoutes.ts";
import {
  classifySearchFailure,
  createSearchFailureReference,
  type SearchFailureCode,
  type SearchFailureResponse,
} from "./searchFailure.ts";
import {
  SearchValidationError,
  toTripRequest,
  validateSearchApiBody,
} from "../utils/searchValidation.ts";
import type { SearchCache } from "../cache/searchCache.ts";
import type { Itinerary } from "../../types/itinerary.ts";
import type { DynamicSearchResult } from "../../types/search.ts";
import type { TripRequest } from "../../types/trip.ts";

type DynamicSearchFunction = (
  request: TripRequest,
  options: { forceTwoStop: boolean },
) => Promise<DynamicSearchResult | Itinerary[]>;

export interface SearchRequestDependencies {
  cache?: SearchCache | null;
  searchDynamicRoutes?: DynamicSearchFunction;
  createFailureReference?: (failureCode: SearchFailureCode) => string;
}

export type SearchRequestResult =
  | {
      status: 200;
      body: DynamicSearchResult;
      headers: Record<string, string>;
    }
  | { status: 400; body: { error: string } }
  | {
      status: 429 | 500 | 502 | 503 | 504;
      body: SearchFailureResponse;
    };

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
        const result = await (dependencies.searchDynamicRoutes ?? searchDynamicRoutePortfolio)(
          tripRequest,
          { forceTwoStop: searchRequest.forceTwoStop === true },
        );
        // Retaining this narrow compatibility path keeps injected test and
        // integration planners written before the response metadata contract
        // working, while production always returns the richer portfolio.
        if (Array.isArray(result)) {
          return {
            count: result.length,
            itineraries: result,
            twoStopDiscovery: { explored: false, canExplore: false, reason: "unavailable" },
          };
        }
        return result;
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

    const failure = classifySearchFailure(error);
    const failureReference = (dependencies.createFailureReference ?? createSearchFailureReference)(
      failure.failureCode,
    );
    console.error(
      `[${failureReference}] search failed (${failure.failureCode}, ${failure.failureStage})${failure.providerStatus === undefined ? "" : ` provider_status=${failure.providerStatus}`}: ${failure.internalMessage}`,
    );
    return {
      status: failure.status,
      body: {
        error:
          failure.failureCode === "SL-PROVIDER-RATE-LIMIT"
            ? "Flight search is temporarily busy. Please try again."
            : "Flight search is currently unavailable. Please try again.",
        failureCode: failure.failureCode,
        failureReference,
        failureStage: failure.failureStage,
        retryable: failure.retryable,
        ...(failure.providerStatus === undefined
          ? {}
          : { providerStatus: failure.providerStatus }),
      },
    };
  }
}
