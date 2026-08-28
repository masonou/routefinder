import { findAirportByCode } from "../data/airports.ts";
import type { FlightOffer } from "../types/flight.ts";
import type { Itinerary } from "../types/itinerary.ts";
import { formatHubStayText } from "../lib/utils/formatFlight.ts";

export type ItineraryDisplayItem =
  | { kind: "flight"; flight: FlightOffer }
  | { kind: "stopover"; text: string };

function nonEmptyText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function getStopoverLocation(stopover: Itinerary["legs"][number]["stopoverAfter"]): string {
  if (!stopover) return "";

  const candidateCity = nonEmptyText(stopover.city);
  if (candidateCity) {
    const candidateCountry = nonEmptyText(stopover.country);
    return candidateCountry ? `${candidateCity}, ${candidateCountry}` : candidateCity;
  }

  const airport = findAirportByCode(stopover.airportCode);
  return airport ? `${airport.city}, ${airport.country}` : stopover.airportCode.trim().toUpperCase();
}

export function getItineraryDisplayItems(itinerary: Itinerary): ItineraryDisplayItem[] {
  return itinerary.legs.flatMap(({ flight, stopoverAfter }) => [
    { kind: "flight" as const, flight },
    ...(stopoverAfter
      ? [{
          kind: "stopover" as const,
          text: formatHubStayText(
            stopoverAfter.nights,
            getStopoverLocation(stopoverAfter),
          ),
        }]
      : []),
  ]);
}
