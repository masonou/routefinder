import type { Itinerary } from "./itinerary.ts";
import type { RequestTiming } from "../lib/instrumentation/searchTiming.ts";

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
  timing?: RequestTiming;
}
