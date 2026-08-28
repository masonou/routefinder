import { TARGET_HUB_STAY_NIGHTS } from "../constants/planner.ts";
import { getItineraryStopovers, type Itinerary } from "../../types/itinerary.ts";
import type { Money } from "../../types/flight.ts";

const PRICE_WEIGHT = 1;
const DURATION_WEIGHT = 0.08;
const STOPS_WEIGHT = 18;
const HUB_STAY_DEVIATION_WEIGHT = 7;

export interface RouteScoreMetrics {
  totalPrice: Money;
  totalFlightDurationMinutes: number;
  totalStops: number;
  hubStayNights: number;
}

// These placeholder weights are intentionally simple and will be tuned later with real usage data.
export function scoreRouteMetrics(metrics: RouteScoreMetrics): number {
  const hubStayPenalty =
    Math.abs(metrics.hubStayNights - TARGET_HUB_STAY_NIGHTS) *
    HUB_STAY_DEVIATION_WEIGHT;

  return (
    10_000 -
    metrics.totalPrice.amount * PRICE_WEIGHT -
    metrics.totalFlightDurationMinutes * DURATION_WEIGHT -
    metrics.totalStops * STOPS_WEIGHT -
    hubStayPenalty
  );
}

export function scoreRoute(itinerary: Itinerary): number {
  return scoreRouteMetrics({
    ...itinerary,
    // Legacy planning still creates one intentional stopover. Direct routes are
    // not scored by this legacy algorithm, but remain safe if constructed.
    hubStayNights: getItineraryStopovers(itinerary)[0]?.nights ?? 0,
  });
}
