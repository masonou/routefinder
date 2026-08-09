import {
  MAX_HUB_STAY_NIGHTS,
  MAX_LEG_DURATION_MINUTES,
  MAX_STOPS_PER_LEG,
  MIN_HUB_STAY_NIGHTS,
} from "../constants/planner.ts";
import { addCalendarDays } from "../utils/dateWindow.ts";
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

export function isArrivalWithinWindow(flight: FlightOffer, window: DateWindow): boolean {
  if (!isValidDateWindow(window)) {
    return false;
  }

  const arrivalDate = getUtcDatePart(flight.arrivalAt);
  if (!arrivalDate) {
    return false;
  }

  return (
    compareIsoDates(arrivalDate, window.start) >= 0 &&
    compareIsoDates(arrivalDate, window.end) <= 0
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

export function isCompatibleConnection(
  firstLeg: FlightOffer,
  secondLeg: FlightOffer,
  hub: string,
  arrivalWindow?: DateWindow
): boolean {
  if (!isReasonableFlight(firstLeg) || !isReasonableFlight(secondLeg)) {
    return false;
  }

  if (firstLeg.destination !== hub || secondLeg.origin !== hub) {
    return false;
  }

  if (firstLeg.indicativePrice.currency !== secondLeg.indicativePrice.currency) {
    return false;
  }

  const firstArrival = parseIsoDateTime(firstLeg.arrivalAt);
  const secondDeparture = parseIsoDateTime(secondLeg.departureAt);
  if (!firstArrival || !secondDeparture || secondDeparture.getTime() <= firstArrival.getTime()) {
    return false;
  }

  const hubStayNights = calculateHubStayNights(firstLeg, secondLeg);
  if (
    hubStayNights < MIN_HUB_STAY_NIGHTS ||
    hubStayNights > MAX_HUB_STAY_NIGHTS
  ) {
    return false;
  }

  return !arrivalWindow || isArrivalWithinWindow(secondLeg, arrivalWindow);
}

export function deriveSecondLegDepartureWindow(
  firstLegOffers: FlightOffer[],
  arrivalWindow?: DateWindow
): DateWindow | null {
  const arrivalDates = firstLegOffers
    .filter((offer) => isReasonableFlight(offer))
    .map((offer) => getUtcDatePart(offer.arrivalAt))
    .filter((date): date is string => date !== null)
    .sort((left, right) => compareIsoDates(left, right));

  if (arrivalDates.length === 0) {
    return null;
  }

  const start = addCalendarDays(arrivalDates[0], MIN_HUB_STAY_NIGHTS);
  const end = addCalendarDays(
    arrivalDates[arrivalDates.length - 1],
    MAX_HUB_STAY_NIGHTS
  );
  const cappedEnd =
    arrivalWindow && compareIsoDates(end, arrivalWindow.end) > 0
      ? arrivalWindow.end
      : end;

  if (compareIsoDates(start, cappedEnd) > 0) {
    return null;
  }

  return {
    start,
    end: cappedEnd,
  };
}
