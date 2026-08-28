import { getAirportCityName } from "../data/airports.ts";
import type { FlightOffer } from "../types/flight.ts";
import type { Itinerary } from "../types/itinerary.ts";
import { formatHubStayText } from "../lib/utils/formatFlight.ts";

export type ItineraryDisplayItem =
  | { kind: "flight"; flight: FlightOffer }
  | { kind: "stopover"; text: string };

export function getItineraryDisplayItems(itinerary: Itinerary): ItineraryDisplayItem[] {
  return itinerary.legs.flatMap(({ flight, stopoverAfter }) => [
    { kind: "flight" as const, flight },
    ...(stopoverAfter
      ? [{
          kind: "stopover" as const,
          text: formatHubStayText(
            stopoverAfter.nights,
            getAirportCityName(stopoverAfter.airportCode),
          ),
        }]
      : []),
  ]);
}
