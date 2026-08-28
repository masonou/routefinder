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
  return itinerary.legs
    .flatMap(({ flight, stopoverAfter }) => [
      airportPath(flight),
      flight.departureAt,
      flight.arrivalAt,
      stopoverAfter?.airportCode ?? "",
      stopoverAfter?.nights ?? "",
    ])
    .join("|");
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
  return left.legs[0]?.flight.departureAt.localeCompare(right.legs[0]?.flight.departureAt ?? "") ?? 0;
}

function areExtremelySimilar(left: Itinerary, right: Itinerary): boolean {
  if (left.legs.length !== right.legs.length) return false;

  return left.legs.every((leftLeg, index) => {
    const rightLeg = right.legs[index];
    if (!rightLeg) return false;
    const leftStopover = leftLeg.stopoverAfter;
    const rightStopover = rightLeg.stopoverAfter;
    return (
      calendarDate(leftLeg.flight.departureAt) === calendarDate(rightLeg.flight.departureAt) &&
      airportPath(leftLeg.flight) === airportPath(rightLeg.flight) &&
      leftLeg.flight.stops === rightLeg.flight.stops &&
      timestampDifferenceMinutes(leftLeg.flight.departureAt, rightLeg.flight.departureAt) <=
        EXTREMELY_SIMILAR_DEPARTURE_MINUTES &&
      leftStopover?.airportCode === rightStopover?.airportCode &&
      Math.abs((leftStopover?.nights ?? 0) - (rightStopover?.nights ?? 0)) <= 1
    );
  });
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
