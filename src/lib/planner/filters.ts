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

/** SearchAPI provides airport-local display timestamps without an offset. */
export function getLocalDatePart(value: string): string | null {
  return getUtcDatePart(value);
}

export function arrivesByDate(flight: FlightOffer, arriveByDate: string | undefined): boolean {
  if (!arriveByDate) return true;
  const arrivalDate = getLocalDatePart(flight.arrivalAt);
  return arrivalDate !== null && arrivalDate <= arriveByDate;
}

export function hasMeaningfulStopover(firstLeg: FlightOffer, secondLeg: FlightOffer): boolean {
  const arrival = parseIsoDateTime(firstLeg.arrivalAt);
  const departure = parseIsoDateTime(secondLeg.departureAt);
  if (!arrival || !departure || departure <= arrival) return false;
  return true;
}

/** Elapsed time at the same hub, calculated from the provider's local timestamps. */
export function calculateHubStayHours(firstLeg: FlightOffer, secondLeg: FlightOffer): number {
  const arrival = parseIsoDateTime(firstLeg.arrivalAt);
  const departure = parseIsoDateTime(secondLeg.departureAt);
  if (!arrival || !departure || departure <= arrival) return -1;
  return (departure.getTime() - arrival.getTime()) / (60 * 60 * 1000);
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

    // SearchAPI timestamps are airport-local display values. Segment endpoints
    // can be in different timezones, so their naive Date values cannot safely
    // establish elapsed chronology. Provider durationMinutes is authoritative.
    if (
      !parseIsoDateTime(segment.departureAt) ||
      !parseIsoDateTime(segment.arrivalAt)
    ) {
      return false;
    }
  }

  if (!parseIsoDateTime(flight.departureAt) || !parseIsoDateTime(flight.arrivalAt)) {
    return false;
  }

  return true;
}

export function calculateHubStayNights(firstLeg: FlightOffer, secondLeg: FlightOffer): number {
  const arrivalDateTime = parseIsoDateTime(firstLeg.arrivalAt);
  const departureDateTime = parseIsoDateTime(secondLeg.departureAt);
  if (!arrivalDateTime || !departureDateTime || !hasMeaningfulStopover(firstLeg, secondLeg)) {
    return -1;
  }

  const elapsedNights = Math.floor(
    (departureDateTime.getTime() - arrivalDateTime.getTime()) / MILLISECONDS_PER_DAY,
  );
  return elapsedNights > 0 ? elapsedNights : -1;
}
