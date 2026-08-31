import {
  MAX_LEG_DURATION_MINUTES,
  MAX_STOPS_PER_LEG,
} from "../constants/planner.ts";
import type { FlightOffer } from "../../types/flight.ts";
import type { DateWindow } from "../../types/trip.ts";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function isValidIsoDate(date: string): boolean {
  if (!ISO_DATE_PATTERN.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function parseIsoDate(date: string): Date | null {
  if (!isValidIsoDate(date)) {
    return null;
  }

  return new Date(`${date}T00:00:00.000Z`);
}

function parseIsoDateTime(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getUtcDatePart(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T/.exec(value);
  if (!match) {
    return null;
  }

  return isValidIsoDate(match[1]) ? match[1] : null;
}

function compareIsoDates(left: string, right: string): number {
  return left.localeCompare(right);
}

export function isValidDateWindow(window: DateWindow): boolean {
  if (!isValidIsoDate(window.start) || !isValidIsoDate(window.end)) {
    return false;
  }

  return compareIsoDates(window.start, window.end) <= 0;
}

export function isFlightWithinDepartureWindow(
  flight: FlightOffer,
  window: DateWindow
): boolean {
  if (!isValidDateWindow(window)) {
    return false;
  }

  const departureDate = getUtcDatePart(flight.departureAt);
  if (!departureDate) {
    return false;
  }

  return (
    compareIsoDates(departureDate, window.start) >= 0 &&
    compareIsoDates(departureDate, window.end) <= 0
  );
}

export function isReasonableFlight(flight: FlightOffer): boolean {
  if (!flight.origin.trim() || !flight.destination.trim()) {
    return false;
  }

  if (flight.segments.length === 0) {
    return false;
  }

  if (flight.durationMinutes <= 0 || flight.durationMinutes > MAX_LEG_DURATION_MINUTES) {
    return false;
  }

  if (flight.stops < 0 || flight.stops > MAX_STOPS_PER_LEG) {
    return false;
  }

  if (
    flight.indicativePrice.amount <= 0 ||
    !flight.indicativePrice.currency.trim()
  ) {
    return false;
  }

  for (const segment of flight.segments) {
    if (
      !segment.origin.trim() ||
      !segment.destination.trim() ||
      !segment.departureAt.trim() ||
      !segment.arrivalAt.trim() ||
      !segment.airlineName.trim()
    ) {
      return false;
    }

    const segmentDeparture = parseIsoDateTime(segment.departureAt);
    const segmentArrival = parseIsoDateTime(segment.arrivalAt);
    if (!segmentDeparture || !segmentArrival || segmentArrival <= segmentDeparture) {
      return false;
    }
  }

  const departure = parseIsoDateTime(flight.departureAt);
  const arrival = parseIsoDateTime(flight.arrivalAt);
  if (!departure || !arrival) {
    return false;
  }

  return arrival.getTime() > departure.getTime();
}

export function calculateHubStayNights(firstLeg: FlightOffer, secondLeg: FlightOffer): number {
  const arrivalDateTime = parseIsoDateTime(firstLeg.arrivalAt);
  const departureDateTime = parseIsoDateTime(secondLeg.departureAt);
  if (!arrivalDateTime || !departureDateTime || departureDateTime <= arrivalDateTime) {
    return -1;
  }

  const arrivalDatePart = getUtcDatePart(firstLeg.arrivalAt);
  const departureDatePart = getUtcDatePart(secondLeg.departureAt);
  if (!arrivalDatePart || !departureDatePart) {
    return -1;
  }

  const arrivalDate = parseIsoDate(arrivalDatePart);
  const departureDate = parseIsoDate(departureDatePart);
  if (!arrivalDate || !departureDate) {
    return -1;
  }

  const calendarDayDifference = Math.floor(
    (departureDate.getTime() - arrivalDate.getTime()) / MILLISECONDS_PER_DAY
  );

  return calendarDayDifference > 0 ? calendarDayDifference : -1;
}
