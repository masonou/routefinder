import type { FlightOffer } from "../../types/flight.ts";
import type { Itinerary } from "../../types/itinerary.ts";

const EXTREMELY_SIMILAR_DEPARTURE_MINUTES = 120;

function airportPath(flight: FlightOffer): string {
  if (flight.segments.length === 0) return `${flight.origin}>${flight.destination}`;
  return [
    ...flight.segments.map((segment) => segment.origin),
    flight.segments[flight.segments.length - 1].destination,
  ].join(">");
}

function calendarDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function timestampDifferenceMinutes(left: string, right: string): number {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return Number.POSITIVE_INFINITY;
  return Math.abs(leftTime - rightTime) / (60 * 1000);
}

function fingerprint(itinerary: Itinerary): string {
  return [
    airportPath(itinerary.firstLeg),
    itinerary.firstLeg.departureAt,
    itinerary.firstLeg.arrivalAt,
    airportPath(itinerary.secondLeg),
    itinerary.secondLeg.departureAt,
    itinerary.secondLeg.arrivalAt,
    itinerary.hubStayNights,
  ].join("|");
}

function compareExactDuplicate(left: Itinerary, right: Itinerary): number {
  if (left.totalPrice.amount !== right.totalPrice.amount) {
    return left.totalPrice.amount - right.totalPrice.amount;
  }
  if (left.score !== right.score) return right.score - left.score;
  return left.totalFlightDurationMinutes - right.totalFlightDurationMinutes;
}

export function compareItineraryRank(left: Itinerary, right: Itinerary): number {
  if (right.score !== left.score) return right.score - left.score;
  if (left.totalPrice.amount !== right.totalPrice.amount) {
    return left.totalPrice.amount - right.totalPrice.amount;
  }
  if (left.totalFlightDurationMinutes !== right.totalFlightDurationMinutes) {
    return left.totalFlightDurationMinutes - right.totalFlightDurationMinutes;
  }
  return left.firstLeg.departureAt.localeCompare(right.firstLeg.departureAt);
}

function areExtremelySimilar(left: Itinerary, right: Itinerary): boolean {
  return (
    calendarDate(left.firstLeg.departureAt) === calendarDate(right.firstLeg.departureAt) &&
    calendarDate(left.secondLeg.departureAt) === calendarDate(right.secondLeg.departureAt) &&
    airportPath(left.firstLeg) === airportPath(right.firstLeg) &&
    airportPath(left.secondLeg) === airportPath(right.secondLeg) &&
    left.firstLeg.stops === right.firstLeg.stops &&
    left.secondLeg.stops === right.secondLeg.stops &&
    timestampDifferenceMinutes(left.firstLeg.departureAt, right.firstLeg.departureAt) <=
      EXTREMELY_SIMILAR_DEPARTURE_MINUTES &&
    timestampDifferenceMinutes(left.secondLeg.departureAt, right.secondLeg.departureAt) <=
      EXTREMELY_SIMILAR_DEPARTURE_MINUTES &&
    Math.abs(left.hubStayNights - right.hubStayNights) <= 1
  );
}

export function selectDiverseItineraries(
  itineraries: Itinerary[],
  limit: number
): Itinerary[] {
  if (limit <= 0) return [];

  const exactJourneys = new Map<string, Itinerary>();
  for (const itinerary of itineraries) {
    const key = fingerprint(itinerary);
    const existing = exactJourneys.get(key);
    if (!existing || compareExactDuplicate(itinerary, existing) < 0) {
      exactJourneys.set(key, itinerary);
    }
  }

  const selected: Itinerary[] = [];
  for (const candidate of Array.from(exactJourneys.values()).sort(compareItineraryRank)) {
    if (selected.some((itinerary) => areExtremelySimilar(candidate, itinerary))) continue;
    selected.push(candidate);
    if (selected.length === limit) break;
  }
  return selected;
}
