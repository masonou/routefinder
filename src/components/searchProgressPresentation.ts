import type { Itinerary } from "../types/itinerary.ts";

export type SearchProgressPhase = "searching" | "complete" | "failed";

export const INITIAL_SEARCH_PROGRESS = 8;
export const MAX_SEARCH_PROGRESS_BEFORE_COMPLETE = 92;
export const COMPLETE_SEARCH_PROGRESS = 100;
export const SEARCH_PROGRESS_TICK_MS = 1_500;
export const SEARCH_PROGRESS_COMPLETION_COLLAPSE_MS = 450;

export function advanceSearchProgress(currentProgress: number): number {
  if (currentProgress >= MAX_SEARCH_PROGRESS_BEFORE_COMPLETE) {
    return MAX_SEARCH_PROGRESS_BEFORE_COMPLETE;
  }

  const increment = currentProgress < 30 ? 4 : currentProgress < 60 ? 3 : 1;
  return Math.min(MAX_SEARCH_PROGRESS_BEFORE_COMPLETE, currentProgress + increment);
}

export function advanceSearchProgressForFoundRoute(
  currentProgress: number,
  foundRouteCount: number,
): number {
  const foundRouteFloor = Math.min(
    MAX_SEARCH_PROGRESS_BEFORE_COMPLETE,
    16 + foundRouteCount * 10,
  );
  return Math.max(currentProgress, foundRouteFloor);
}

export function getSearchProgressText(
  phase: SearchProgressPhase,
  foundRouteCount: number,
): string {
  if (phase === "complete") {
    return `✓ Search complete · ${foundRouteCount} ${foundRouteCount === 1 ? "route" : "routes"} found`;
  }
  if (phase === "searching" && foundRouteCount > 0) {
    return `Finding more routes… · ${foundRouteCount} found`;
  }
  return "Finding the best stopover routes…";
}

export function countUniqueItineraries(itineraries: Itinerary[]): number {
  return new Set(itineraries.map((itinerary) => itinerary.id)).size;
}

export function shouldHandleSearchProgressEvent(
  activeSearchId: number,
  eventSearchId: number,
  isAborted: boolean,
): boolean {
  return activeSearchId === eventSearchId && !isAborted;
}
