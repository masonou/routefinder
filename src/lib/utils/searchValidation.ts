import { findAirportByCode } from "../../data/airports.ts";
import { MAX_JOURNEY_WINDOW_DAYS } from "../constants/planner.ts";
import { calendarDayDifference } from "./dateWindow.ts";
import type { TripRequest } from "../../types/trip.ts";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface SearchFormValues {
  origin: string;
  destination: string;
  earliestDeparture: string;
  arriveBy?: string;
}

export interface PublicSearchRequest extends Omit<SearchFormValues, "arriveBy"> {
  arriveBy: string;
  adults: number;
  /** Server-facing only; never written to the results URL. */
  forceTwoStop?: boolean;
}

export interface SearchFormErrors {
  origin?: string;
  destination?: string;
  dates?: string;
}

export class SearchValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "SearchValidationError";
  }
}

function parseIsoDate(date: string): Date | null {
  if (!ISO_DATE_PATTERN.test(date)) return null;

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date
    ? null
    : parsed;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasErrors(errors: SearchFormErrors): boolean {
  return Object.values(errors).some((value) => typeof value === "string");
}

export function normalizeAirportCodeInput(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

export function validateSearchFormValues(values: SearchFormValues): SearchFormErrors {
  const errors: SearchFormErrors = {};
  const origin = normalizeAirportCodeInput(values.origin);
  const destination = normalizeAirportCodeInput(values.destination);

  if (!findAirportByCode(origin)) {
    errors.origin = "Select an airport.";
  }

  if (!findAirportByCode(destination)) {
    errors.destination = "Select an airport.";
  } else if (origin === destination && findAirportByCode(origin)) {
    errors.destination = "Choose different airports.";
  }

  if (!values.earliestDeparture || !values.arriveBy) {
    errors.dates = "Choose both departure and arrive-by dates.";
  } else if (!isValidIsoDate(values.earliestDeparture) || !isValidIsoDate(values.arriveBy)) {
    errors.dates = "Use valid dates.";
  } else if (values.earliestDeparture < todayIsoDate()) {
    errors.dates = "Dates cannot be in the past.";
  } else if (values.arriveBy <= values.earliestDeparture) {
    errors.dates = "Arrive by must be after departure.";
  } else if (calendarDayDifference(values.earliestDeparture, values.arriveBy) > MAX_JOURNEY_WINDOW_DAYS) {
    errors.dates = `Journey windows can be at most ${MAX_JOURNEY_WINDOW_DAYS} days.`;
  }

  return errors;
}

export function createSearchRequestFromFormValues(
  values: SearchFormValues,
  adults = 1
): PublicSearchRequest {
  const errors = validateSearchFormValues(values);
  if (hasErrors(errors)) {
    throw new SearchValidationError(errors.origin ?? errors.destination ?? errors.dates ?? "Invalid search.");
  }
  if (!Number.isInteger(adults) || adults <= 0) {
    throw new SearchValidationError("Adults must be a positive integer.");
  }

  return {
    origin: normalizeAirportCodeInput(values.origin),
    destination: normalizeAirportCodeInput(values.destination),
    earliestDeparture: values.earliestDeparture,
    arriveBy: values.arriveBy as string,
    adults,
  };
}

function getRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new SearchValidationError(`Missing ${key}.`);
  return value;
}

export function validateSearchApiBody(body: unknown): PublicSearchRequest {
  if (typeof body !== "object" || body === null) {
    throw new SearchValidationError("Request body must be an object.");
  }
  const record = body as Record<string, unknown>;
  const adultsValue = record.adults;
  const adults = adultsValue === undefined ? 1 : adultsValue;
  if (typeof adults !== "number" || !Number.isInteger(adults)) {
    throw new SearchValidationError("Adults must be a positive integer.");
  }

  const forceTwoStop = record.forceTwoStop;
  if (forceTwoStop !== undefined && typeof forceTwoStop !== "boolean") {
    throw new SearchValidationError("forceTwoStop must be a boolean.");
  }

  const request = createSearchRequestFromFormValues(
    {
      origin: getRequiredString(record, "origin"),
      destination: getRequiredString(record, "destination"),
      earliestDeparture: getRequiredString(record, "earliestDeparture"),
      arriveBy: getRequiredString(record, "arriveBy"),
    },
    adults
  );
  return forceTwoStop === true ? { ...request, forceTwoStop: true } : request;
}

export function toTripRequest(request: PublicSearchRequest): TripRequest {
  return {
    origin: request.origin,
    destination: request.destination,
    departureWindow: {
      start: request.earliestDeparture,
      end: request.earliestDeparture,
    },
    arriveByDate: request.arriveBy,
    adults: request.adults,
  };
}

export function buildResultsUrl(values: SearchFormValues): string {
  const params = new URLSearchParams({
    origin: normalizeAirportCodeInput(values.origin),
    destination: normalizeAirportCodeInput(values.destination),
    earliestDeparture: values.earliestDeparture,
    arriveBy: values.arriveBy ?? "",
  });
  return `/results?${params.toString()}`;
}
