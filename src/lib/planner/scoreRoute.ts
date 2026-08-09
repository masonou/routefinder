import { TARGET_HUB_STAY_NIGHTS } from "../constants/planner.ts";
import type { Itinerary } from "../../types/itinerary.ts";

const PRICE_WEIGHT = 1;
const DURATION_WEIGHT = 0.08;
const STOPS_WEIGHT = 18;
const HUB_STAY_DEVIATION_WEIGHT = 7;

// These placeholder weights are intentionally simple and will be tuned later with real usage data.
export function scoreRoute(itinerary: Itinerary): number {
  const hubStayPenalty =
    Math.abs(itinerary.hubStayNights - TARGET_HUB_STAY_NIGHTS) * HUB_STAY_DEVIATION_WEIGHT;

  return (
    10_000 -
    itinerary.totalPrice.amount * PRICE_WEIGHT -
    itinerary.totalFlightDurationMinutes * DURATION_WEIGHT -
    itinerary.totalStops * STOPS_WEIGHT -
    hubStayPenalty
  );
}
