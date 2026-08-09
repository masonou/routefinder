import { findAirportByCode } from "../../data/airports.ts";
import { DEPARTURE_FLEX_DAYS } from "../constants/planner.ts";
import { addCalendarDays } from "./dateWindow.ts";
import type { TripRequest } from "../../types/trip.ts";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface SearchFormValues {
  origin: string;
  destination: string;
  earliestDeparture: string;
}

export interface PublicSearchRequest extends SearchFormValues {
  adults: number;
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

  if (!values.earliestDeparture) {
    errors.dates = "Choose a departure date.";
  } else if (!isValidIsoDate(values.earliestDeparture)) {
    errors.dates = "Use valid dates.";
  } else if (values.earliestDeparture < todayIsoDate()) {
    errors.dates = "Dates cannot be in the past.";
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

  return createSearchRequestFromFormValues(
    {
      origin: getRequiredString(record, "origin"),
      destination: getRequiredString(record, "destination"),
      earliestDeparture: getRequiredString(record, "earliestDeparture"),
    },
    adults
  );
}

export function toTripRequest(request: PublicSearchRequest): TripRequest {
  return {
    origin: request.origin,
    destination: request.destination,
    departureWindow: {
      start: request.earliestDeparture,
      end: addCalendarDays(request.earliestDeparture, DEPARTURE_FLEX_DAYS),
    },
    adults: request.adults,
  };
}

export function buildResultsUrl(values: SearchFormValues): string {
  const params = new URLSearchParams({
    origin: normalizeAirportCodeInput(values.origin),
    destination: normalizeAirportCodeInput(values.destination),
    earliestDeparture: values.earliestDeparture,
  });
  return `/results?${params.toString()}`;
}
