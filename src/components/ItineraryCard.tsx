import type { Itinerary } from "../types/itinerary.ts";
import {
  formatDuration,
  formatHubStayText,
  formatMoney,
} from "../lib/utils/formatFlight.ts";
import { FlightLeg } from "./FlightLeg";

interface ItineraryCardProps {
  itinerary: Itinerary;
}

export function ItineraryCard({ itinerary }: ItineraryCardProps) {
  return (
    <article className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
      <FlightLeg leg={itinerary.firstLeg} />
      <p className="text-sm font-medium text-stone-900">
        {formatHubStayText(itinerary.hubStayNights)}
      </p>
      <FlightLeg leg={itinerary.secondLeg} />
      <div className="border-t border-stone-200 pt-4 text-sm text-stone-700">
        <p className="font-medium text-stone-950">
          Approx. total{" "}
          {formatMoney(itinerary.totalPrice.amount, itinerary.totalPrice.currency)}
        </p>
        <p>
          {formatDuration(itinerary.totalFlightDurationMinutes)} flying ·{" "}
          {itinerary.totalStops} {itinerary.totalStops === 1 ? "stop" : "stops"}
        </p>
      </div>
    </article>
  );
}
