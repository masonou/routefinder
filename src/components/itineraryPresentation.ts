import { findAirportByCode } from "../data/airports.ts";
import { formatDuration, formatFlightDate } from "../lib/utils/formatFlight.ts";
import type { FlightOffer } from "../types/flight.ts";
import {
  getItineraryStopovers,
  type Itinerary,
  type ItineraryStopover,
} from "../types/itinerary.ts";

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

function formatAirportLabel(airportCode: string): string {
  return findAirportByCode(airportCode)?.city ?? airportCode;
}

function formatStopoverCity(stopover: ItineraryStopover): string {
  return stopover.city?.trim() || formatAirportLabel(stopover.airportCode);
}

export function isDirectBaseline(itinerary: Itinerary): boolean {
  return getItineraryStopovers(itinerary).length === 0;
}

export function partitionItineraries(itineraries: Itinerary[]): {
  directOptions: Array<{ itinerary: Itinerary; rank: number }>;
  adventures: Array<{ itinerary: Itinerary; rank: number }>;
  oneStopAdventures: Array<{ itinerary: Itinerary; rank: number }>;
  twoStopAdventures: Array<{ itinerary: Itinerary; rank: number }>;
} {
  const rankedItineraries = itineraries.map((itinerary, index) => ({
    itinerary,
    rank: index + 1,
  }));

  const directOptions = rankedItineraries.filter(({ itinerary }) => isDirectBaseline(itinerary));
  const oneStopAdventures = rankedItineraries.filter(
    ({ itinerary }) => getItineraryStopovers(itinerary).length === 1,
  );
  const twoStopAdventures = rankedItineraries.filter(
    ({ itinerary }) => getItineraryStopovers(itinerary).length === 2,
  );
  return { directOptions, adventures: oneStopAdventures, oneStopAdventures, twoStopAdventures };
}

/** Initial expansion is presentation-only; all itineraries are already returned. */
export function getInitialAdventureVisibility(
  oneStopCount: number,
  twoStopCount: number,
): { oneStop: number; twoStop: number } {
  if (oneStopCount > 0 && twoStopCount > 0) {
    return { oneStop: Math.min(2, oneStopCount), twoStop: Math.min(1, twoStopCount) };
  }
  return { oneStop: Math.min(3, oneStopCount), twoStop: Math.min(3, twoStopCount) };
}

export function getStopoverHeadline(stopover: ItineraryStopover): string {
  return `${stopover.nights} ${stopover.nights === 1 ? "night" : "nights"} in ${getStopoverLocation(stopover)}`;
}

export function getItineraryTimeline(itinerary: Itinerary): Array<{ code: string; label: string }> {
  return [
    { code: itinerary.origin, label: formatAirportLabel(itinerary.origin) },
    ...getItineraryStopovers(itinerary).map((stopover) => ({
      code: stopover.airportCode,
      label: formatStopoverCity(stopover),
    })),
    { code: itinerary.destination, label: formatAirportLabel(itinerary.destination) },
  ];
}

export function getFlightRouteLabel(flight: FlightOffer): string {
  const destinations = flight.segments.map((segment) => segment.destination);
  return [flight.origin, ...(destinations.length > 0 ? destinations : [flight.destination])].join(" → ");
}

export function getFlightAirlines(flight: FlightOffer): string {
  return Array.from(new Set(flight.segments.map((segment) => segment.airlineName))).join(", ");
}

export function getFlightConnectionLabel(flight: FlightOffer): string {
  if (flight.stops === 0) return "Nonstop";

  const connectionCount = `${flight.stops} ${flight.stops === 1 ? "connection" : "connections"}`;
  const via = Array.from(new Set(flight.segments.slice(0, -1).map((segment) => segment.destination)));
  return via.length > 0 ? `${connectionCount} · via ${via.join(", ")}` : connectionCount;
}

export function getFlightDetailLabel(flight: FlightOffer): string {
  return `${formatFlightDate(flight.departureAt)} · ${getFlightConnectionLabel(flight)} · ${formatDuration(flight.durationMinutes)}`;
}

export function formatResultMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getConnectionSummary(itinerary: Itinerary): string {
  if (itinerary.totalStops > 0) {
    return `${itinerary.totalStops} ${itinerary.totalStops === 1 ? "connection" : "connections"}`;
  }

  if (itinerary.legs.length === 1) return "Nonstop";
  if (itinerary.legs.length === 2) return "Both flights nonstop";
  return `All ${itinerary.legs.length} flights nonstop`;
}

export function getDirectPriceComparison(
  itinerary: Itinerary,
  directBaseline: Itinerary | undefined,
): string | undefined {
  if (!directBaseline || directBaseline.totalPrice.currency !== itinerary.totalPrice.currency) {
    return undefined;
  }

  const difference = directBaseline.totalPrice.amount - itinerary.totalPrice.amount;
  if (difference === 0) return undefined;

  const amount = formatResultMoney(Math.abs(difference), itinerary.totalPrice.currency);
  return difference > 0 ? `${amount} cheaper than direct` : `${amount} more than direct`;
}

export function getAffiliateClickProperties(itinerary: Itinerary, rank: number) {
  const primaryStopover = getItineraryStopovers(itinerary)[0];
  return {
    affiliate: "kiwi" as const,
    origin: itinerary.origin,
    destination: itinerary.destination,
    hub: primaryStopover?.airportCode ?? "",
    rank,
    totalPrice: itinerary.totalPrice.amount,
    currency: itinerary.totalPrice.currency,
    hubStayNights: primaryStopover?.nights ?? 0,
  };
}
