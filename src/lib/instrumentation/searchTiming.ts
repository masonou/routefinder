/**
 * Request-local, wall-clock search diagnostics. These values are deliberately
 * observational: callers record boundaries around the work that already exists.
 */
export interface SearchTiming {
  searchTotalMs: number;
  searchCacheReadMs: number;
  searchCacheWriteMs: number;
  searchCacheHit: boolean;
  timeToFirstVerifiedItineraryMs?: number;
  forcedTwoStopRequestTotalMs?: number;
  exploreWallMs: number;
  exploreRequests: number;
  exploreLiveRequests: number;
  exploreCacheHits: number;
  stage1ProcessingMs: number;
  cleanCalendarWallMs: number;
  cleanCalendarRequests: number;
  cleanCalendarLiveRequests: number;
  cleanCalendarCacheHits: number;
  cleanDetailedWallMs: number;
  cleanDetailedRequests: number;
  cleanDetailedLiveRequests: number;
  cleanDetailedCacheHits: number;
  fallbackTriggered: boolean;
  fallbackCalendarWallMs: number;
  fallbackCalendarRequests: number;
  fallbackCalendarLiveRequests: number;
  fallbackCalendarCacheHits: number;
  fallbackDetailedWallMs: number;
  fallbackDetailedRequests: number;
  fallbackDetailedLiveRequests: number;
  fallbackDetailedCacheHits: number;
  directCalendarMs: number;
  directCalendarLiveRequests: number;
  directCalendarCacheHits: number;
  directDetailedMs: number;
  directDetailedLiveRequests: number;
  directDetailedCacheHits: number;
  directTotalMs: number;
  twoStopTriggered: boolean;
  twoStopForced: boolean;
  twoStopTotalMs: number;
  twoStopH1SelectionMs: number;
  twoStopExploreWallMs: number;
  twoStopExploreRequests: number;
  twoStopExploreLiveRequests: number;
  twoStopExploreCacheHits: number;
  twoStopPairCandidateProcessingMs: number;
  twoStopCalendarWallMs: number;
  twoStopCalendarRequests: number;
  twoStopCalendarLiveRequests: number;
  twoStopCalendarCacheHits: number;
  twoStopDetailedWallMs: number;
  twoStopDetailedRequests: number;
  twoStopDetailedLiveRequests: number;
  twoStopDetailedCacheHits: number;
  providerLiveRequests: number;
  providerCacheHits: number;
}

export type RequestTiming = Omit<SearchTiming, "searchTotalMs" | "searchCacheReadMs" | "searchCacheWriteMs" | "searchCacheHit">;

export function nowMs(): number {
  return performance.now();
}

export function elapsedMs(start: number): number {
  return Number((nowMs() - start).toFixed(2));
}

export function countCacheStatuses(lookups: Array<{ cacheStatus: "HIT" | "MISS" }>) {
  const cacheHits = lookups.filter((lookup) => lookup.cacheStatus === "HIT").length;
  return { requests: lookups.length, cacheHits, liveRequests: lookups.length - cacheHits };
}

export function emptyRequestTiming(): RequestTiming {
  return {
    exploreWallMs: 0, exploreRequests: 0, exploreLiveRequests: 0, exploreCacheHits: 0,
    stage1ProcessingMs: 0,
    cleanCalendarWallMs: 0, cleanCalendarRequests: 0, cleanCalendarLiveRequests: 0, cleanCalendarCacheHits: 0,
    cleanDetailedWallMs: 0, cleanDetailedRequests: 0, cleanDetailedLiveRequests: 0, cleanDetailedCacheHits: 0,
    fallbackTriggered: false,
    fallbackCalendarWallMs: 0, fallbackCalendarRequests: 0, fallbackCalendarLiveRequests: 0, fallbackCalendarCacheHits: 0,
    fallbackDetailedWallMs: 0, fallbackDetailedRequests: 0, fallbackDetailedLiveRequests: 0, fallbackDetailedCacheHits: 0,
    directCalendarMs: 0, directCalendarLiveRequests: 0, directCalendarCacheHits: 0,
    directDetailedMs: 0, directDetailedLiveRequests: 0, directDetailedCacheHits: 0, directTotalMs: 0,
    twoStopTriggered: false, twoStopForced: false, twoStopTotalMs: 0, twoStopH1SelectionMs: 0,
    twoStopExploreWallMs: 0, twoStopExploreRequests: 0, twoStopExploreLiveRequests: 0, twoStopExploreCacheHits: 0,
    twoStopPairCandidateProcessingMs: 0,
    twoStopCalendarWallMs: 0, twoStopCalendarRequests: 0, twoStopCalendarLiveRequests: 0, twoStopCalendarCacheHits: 0,
    twoStopDetailedWallMs: 0, twoStopDetailedRequests: 0, twoStopDetailedLiveRequests: 0, twoStopDetailedCacheHits: 0,
    providerLiveRequests: 0, providerCacheHits: 0,
  };
}

export function summarizeSearchTiming(timing: SearchTiming, route: string): void {
  if (process.env.SEARCH_DEBUG_TIMINGS !== "true" && process.env.NODE_ENV !== "development") return;
  console.info("[search-performance]", JSON.stringify({ route, ...timing }));
}
