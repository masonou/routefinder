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
import type { SearchProgressEvent } from "../../types/search.ts";
import { elapsedMs, emptyRequestTiming, nowMs, summarizeSearchTiming, type SearchTiming } from "../instrumentation/searchTiming.ts";

type DynamicSearchFunction = (
  request: TripRequest,
  options: {
    forceTwoStop: boolean;
    onItineraryVerified?: (itinerary: Itinerary, category: import("../../types/search.ts").ItineraryProgressCategory) => void;
  },
) => Promise<DynamicSearchResult | Itinerary[]>;

export interface SearchRequestDependencies {
  cache?: SearchCache | null;
  searchDynamicRoutes?: DynamicSearchFunction;
  createFailureReference?: (failureCode: SearchFailureCode) => string;
}

export interface SearchRequestProgressOptions {
  onProgress?: (event: SearchProgressEvent) => void;
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
  dependencies: SearchRequestDependencies = {},
  progress: SearchRequestProgressOptions = {},
): Promise<SearchRequestResult> {
  const searchStartedAt = nowMs();
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { status: 400, body: { error: "Invalid JSON." } };
  }

  try {
    const searchRequest = validateSearchApiBody(body);
    progress.onProgress?.({ type: "search_started" });
    const tripRequest = toTripRequest(searchRequest);
    const cache = dependencies.cache === undefined ? getSearchCache() : dependencies.cache;
    const searchResult = await runCachedSearch({
      key: buildSearchCacheKey(searchRequest),
      cache,
      async load() {
        const result = await (dependencies.searchDynamicRoutes ?? searchDynamicRoutePortfolio)(
          tripRequest,
          {
            forceTwoStop: searchRequest.forceTwoStop === true,
            onItineraryVerified: (itinerary, category) =>
              progress.onProgress?.({ type: "itinerary_found", itinerary, category }),
          },
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
    const plannerTiming = searchResult.cacheStatus === "HIT"
      ? emptyRequestTiming()
      : searchResult.value.timing ?? emptyRequestTiming();
    const timing: SearchTiming = {
      ...plannerTiming,
      searchTotalMs: elapsedMs(searchStartedAt),
      searchCacheReadMs: searchResult.cacheReadMs,
      searchCacheWriteMs: searchResult.cacheWriteMs,
      searchCacheHit: searchResult.cacheStatus === "HIT",
      ...(searchRequest.forceTwoStop === true
        ? { forcedTwoStopRequestTotalMs: elapsedMs(searchStartedAt) }
        : {}),
    };
    summarizeSearchTiming(timing, `${searchRequest.origin}→${searchRequest.destination} ${searchRequest.earliestDeparture}→${searchRequest.arriveBy}`);
    // Detailed timing is server-only by default. Strip the planner's internal
    // timing before serialising, then attach the safe aggregate only when a
    // local debug session explicitly asks for it.
    const publicResult = { ...searchResult.value };
    delete publicResult.timing;
    const responseBody = process.env.SEARCH_DEBUG_TIMINGS === "true"
      ? { ...publicResult, timing }
      : publicResult;
    if (searchResult.cacheStatus === "HIT") {
      progress.onProgress?.({ type: "search_snapshot", result: responseBody });
    }
    progress.onProgress?.({ type: "search_complete", result: responseBody });

    return {
      status: 200,
      body: responseBody,
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
