import type { Itinerary } from "./itinerary.ts";
import type { RequestTiming, SearchTiming } from "../lib/instrumentation/searchTiming.ts";

export type TwoStopDiscoveryReason =
  | "already_explored"
  | "portfolio_full"
  | "route_too_short"
  | "not_needed"
  | "unavailable";

/** Search-level state for the optional two-stop expansion. */
export interface TwoStopDiscoveryMetadata {
  explored: boolean;
  canExplore: boolean;
  reason: TwoStopDiscoveryReason;
}

export interface DynamicSearchResult {
  count: number;
  itineraries: Itinerary[];
  twoStopDiscovery: TwoStopDiscoveryMetadata;
  /** Server-only unless SEARCH_DEBUG_TIMINGS is enabled. */
  timing?: RequestTiming | SearchTiming;
}

export type ItineraryProgressCategory = "direct" | "one_stop" | "two_stop";

export type SearchProgressEvent =
  | { type: "search_started" }
  | { type: "itinerary_found"; category: ItineraryProgressCategory; itinerary: Itinerary }
  | { type: "search_snapshot"; result: DynamicSearchResult }
  | { type: "search_complete"; result: DynamicSearchResult }
  | {
      type: "search_failed";
      error: string;
      failureCode?: string;
      failureReference?: string;
      failureStage?: string;
      retryable?: boolean;
      providerStatus?: number;
    };
