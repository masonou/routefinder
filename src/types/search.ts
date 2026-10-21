import type { Itinerary } from "./itinerary.ts";
import type { RequestTiming, SearchTiming } from "../lib/instrumentation/searchTiming.ts";

export type TwoStopDiscoveryReason =
  | "already_explored"
  | "portfolio_full"
  | "insufficient_journey_window"
  | "route_too_short"
  | "not_needed"
  | "unavailable";

/** Search-level state for the optional two-stop expansion. */
export interface TwoStopDiscoveryMetadata {
  explored: boolean;
  canExplore: boolean;
  reason: TwoStopDiscoveryReason;
}

/**
 * A completed planner outcome. Provider failures deliberately do not appear
 * here: they are represented by the typed API failure response instead.
 */
export type SearchOutcome =
  | "success"
  | "no_usable_origin_flights"
  | "no_stopover_within_window"
  | "direct_only";

export interface DynamicSearchResult {
  count: number;
  itineraries: Itinerary[];
  twoStopDiscovery: TwoStopDiscoveryMetadata;
  outcome: SearchOutcome;
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
