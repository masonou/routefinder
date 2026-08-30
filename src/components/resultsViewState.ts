import type { Itinerary } from "../types/itinerary.ts";

export type ResultsViewState = "error" | "loading" | "empty" | "results";

export function getResultsViewState(
  itineraries: Itinerary[] | null,
  errorMessage: string | null,
): ResultsViewState {
  if (errorMessage) return "error";
  if (itineraries === null) return "loading";
  return itineraries.length === 0 ? "empty" : "results";
}
