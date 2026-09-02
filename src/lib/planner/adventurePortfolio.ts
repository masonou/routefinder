import type { Itinerary } from "../../types/itinerary.ts";

export function intentionalStopoverCount(itinerary: Itinerary): number {
  return itinerary.legs.filter((leg) => leg.stopoverAfter !== undefined).length;
}

/** Classification is based solely on final verified flight structure. */
export function isCleanOneStopAdventure(itinerary: Itinerary): boolean {
  return intentionalStopoverCount(itinerary) === 1 &&
    itinerary.legs.length === 2 && itinerary.legs.every((leg) => leg.flight.stops === 0);
}

export function isConnectingOneStopAdventure(itinerary: Itinerary): boolean {
  return intentionalStopoverCount(itinerary) === 1 &&
    itinerary.legs.some((leg) => leg.flight.stops > 0);
}

export interface OneStopPortfolioCategories {
  clean: Itinerary[];
  connecting: Itinerary[];
}

export function partitionOneStopAdventures(
  itineraries: Itinerary[],
): OneStopPortfolioCategories {
  return {
    clean: itineraries.filter(isCleanOneStopAdventure),
    connecting: itineraries.filter(isConnectingOneStopAdventure),
  };
}
