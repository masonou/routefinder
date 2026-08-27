import type { Itinerary } from "../types/itinerary.ts";
import { getAirportCityName } from "../data/airports";
import {
  formatDuration,
  formatHubStayText,
  formatMoney,
} from "../lib/utils/formatFlight.ts";
import { trackAffiliateClick } from "../lib/analytics/events";
import { KIWI_AFFILIATE_URL } from "../lib/constants/affiliates.ts";
import { FlightLeg } from "./FlightLeg";

interface ItineraryCardProps {
  itinerary: Itinerary;
  rank: number;
}

export function ItineraryCard({ itinerary, rank }: ItineraryCardProps) {
  return (
    <article className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
      <FlightLeg leg={itinerary.firstLeg} />
      <p className="text-sm font-medium text-stone-900">
        {formatHubStayText(itinerary.hubStayNights, getAirportCityName(itinerary.hub))}
      </p>
      <FlightLeg leg={itinerary.secondLeg} />
      <div className="border-t border-stone-200 pt-4 text-sm text-stone-700">
        <p className="font-medium text-stone-950">
          ~{" "}
          {formatMoney(
            itinerary.totalPrice.amount,
            itinerary.totalPrice.currency,
          )}
        </p>
        <p>
          {formatDuration(itinerary.totalFlightDurationMinutes)} flying ·{" "}
          {itinerary.totalStops} {itinerary.totalStops === 1 ? "stop" : "stops"}
        </p>
      </div>
      <a
        href={KIWI_AFFILIATE_URL}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={() => {
          trackAffiliateClick({
            affiliate: "kiwi",
            origin: itinerary.origin,
            destination: itinerary.destination,
            hub: itinerary.hub,
            rank,
            totalPrice: itinerary.totalPrice.amount,
            currency: itinerary.totalPrice.currency,
            hubStayNights: itinerary.hubStayNights,
          });
        }}
        className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Check flights on Kiwi
      </a>
    </article>
  );
}
