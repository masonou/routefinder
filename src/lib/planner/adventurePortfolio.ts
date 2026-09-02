import type { Itinerary } from "../../types/itinerary.ts";

export const MAX_DEFAULT_ADVENTURES = 3;

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

export interface DefaultAdventurePortfolio {
  itineraries: Itinerary[];
  cleanOneStop: Itinerary[];
  twoStop: Itinerary[];
  connectingOneStop: Itinerary[];
  suppressedConnectingOneStop: Itinerary[];
  suppressedTwoStop: Itinerary[];
}

/**
 * Scores are deliberately never compared across categories. Existing ordering
 * inside each input category is retained while structural quality fills slots.
 */
export function assembleDefaultAdventurePortfolio(input: {
  oneStopAdventures: Itinerary[];
  twoStopAdventures: Itinerary[];
  maxAdventures?: number;
}): DefaultAdventurePortfolio {
  const max = input.maxAdventures ?? MAX_DEFAULT_ADVENTURES;
  const oneStop = partitionOneStopAdventures(input.oneStopAdventures);
  const cleanOneStop = oneStop.clean.slice(0, max);
  const remainingAfterClean = Math.max(0, max - cleanOneStop.length);
  const twoStop = input.twoStopAdventures.slice(0, remainingAfterClean);
  const remainingAfterTwoStop = Math.max(0, remainingAfterClean - twoStop.length);
  const connectingOneStop = oneStop.connecting.slice(0, remainingAfterTwoStop);

  return {
    itineraries: [...cleanOneStop, ...twoStop, ...connectingOneStop],
    cleanOneStop,
    twoStop,
    connectingOneStop,
    suppressedConnectingOneStop: oneStop.connecting.slice(connectingOneStop.length),
    suppressedTwoStop: input.twoStopAdventures.slice(twoStop.length),
  };
}
