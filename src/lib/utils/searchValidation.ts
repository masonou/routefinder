import type { TripRequest } from "../../types/trip.ts";

const AIRPORT_CODE_PATTERN = /^[A-Z]{3}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export const MAX_DEPARTURE_WINDOW_DAYS = 7;

export interface SearchFormValues {
  origin: string;
  destination: string;
  departureStart: string;
  departureEnd: string;
  arrivalStart: string;
  arrivalEnd: string;
}

export interface SearchFormErrors {
  origin?: string;
  destination?: string;
  departure?: string;
  arrival?: string;
}

export class SearchValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "SearchValidationError";
  }
}

function parseIsoDate(date: string): Date | null {
  if (!ISO_DATE_PATTERN.test(date)) {
    return null;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return null;
  }

  return parsed;
}

function getInclusiveDateCount(start: string, end: string): number | null {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate || startDate > endDate) {
    return null;
  }

  return (
    Math.floor((endDate.getTime() - startDate.getTime()) / MILLISECONDS_PER_DAY) + 1
  );
}

function hasErrors(errors: SearchFormErrors): boolean {
  return Object.values(errors).some((value) => typeof value === "string");
}

export function normalizeAirportCodeInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

export function isValidIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

export function validateSearchFormValues(values: SearchFormValues): SearchFormErrors {
  const errors: SearchFormErrors = {};
  const origin = normalizeAirportCodeInput(values.origin);
  const destination = normalizeAirportCodeInput(values.destination);

  if (!AIRPORT_CODE_PATTERN.test(origin)) {
    errors.origin = "Enter a 3-letter code.";
  }

  if (!AIRPORT_CODE_PATTERN.test(destination)) {
    errors.destination = "Enter a 3-letter code.";
  } else if (origin === destination && origin.length === 3) {
    errors.destination = "Use a different airport.";
  }

  if (!values.departureStart || !values.departureEnd) {
    errors.departure = "Choose both dates.";
  } else if (!isValidIsoDate(values.departureStart) || !isValidIsoDate(values.departureEnd)) {
    errors.departure = "Use valid dates.";
  } else if (values.departureStart > values.departureEnd) {
    errors.departure = "Latest date must be after earliest.";
  } else {
    const departureDays = getInclusiveDateCount(
      values.departureStart,
      values.departureEnd
    );
    if (departureDays === null) {
      errors.departure = "Use valid dates.";
    } else if (departureDays > MAX_DEPARTURE_WINDOW_DAYS) {
      errors.departure = "Range must be 7 days or less.";
    }
  }

  if (!values.arrivalStart || !values.arrivalEnd) {
    errors.arrival = "Choose both dates.";
  } else if (!isValidIsoDate(values.arrivalStart) || !isValidIsoDate(values.arrivalEnd)) {
    errors.arrival = "Use valid dates.";
  } else if (values.arrivalStart > values.arrivalEnd) {
    errors.arrival = "Latest date must be after earliest.";
  } else if (isValidIsoDate(values.departureStart) && values.arrivalEnd < values.departureStart) {
    errors.arrival = "Arrival must be after departure.";
  }

  return errors;
}

export function createSearchRequestFromFormValues(
  values: SearchFormValues,
  adults = 1
): TripRequest {
  const errors = validateSearchFormValues(values);
  if (hasErrors(errors)) {
    throw new SearchValidationError(
      errors.origin ??
        errors.destination ??
        errors.departure ??
        errors.arrival ??
        "Invalid search."
    );
  }

  if (!Number.isInteger(adults) || adults <= 0) {
    throw new SearchValidationError("Adults must be a positive integer.");
  }

  return {
    origin: normalizeAirportCodeInput(values.origin),
    destination: normalizeAirportCodeInput(values.destination),
    departureWindow: {
      start: values.departureStart,
      end: values.departureEnd,
    },
    arrivalWindow: {
      start: values.arrivalStart,
      end: values.arrivalEnd,
    },
    adults,
  };
}

function getRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new SearchValidationError(`Missing ${key}.`);
  }

  return value;
}

export function validateSearchApiBody(body: unknown): TripRequest {
  if (typeof body !== "object" || body === null) {
    throw new SearchValidationError("Request body must be an object.");
  }

  const record = body as Record<string, unknown>;
  const departureWindow =
    typeof record["departureWindow"] === "object" && record["departureWindow"] !== null
      ? (record["departureWindow"] as Record<string, unknown>)
      : null;
  const arrivalWindow =
    typeof record["arrivalWindow"] === "object" && record["arrivalWindow"] !== null
      ? (record["arrivalWindow"] as Record<string, unknown>)
      : null;

  if (!departureWindow || !arrivalWindow) {
    throw new SearchValidationError("Departure and arrival windows are required.");
  }

  const adultsValue = record["adults"];
  const adults =
    typeof adultsValue === "number" && Number.isInteger(adultsValue)
      ? adultsValue
      : adultsValue === undefined
        ? 1
        : NaN;

  return createSearchRequestFromFormValues(
    {
      origin: getRequiredString(record, "origin"),
      destination: getRequiredString(record, "destination"),
      departureStart: getRequiredString(departureWindow, "start"),
      departureEnd: getRequiredString(departureWindow, "end"),
      arrivalStart: getRequiredString(arrivalWindow, "start"),
      arrivalEnd: getRequiredString(arrivalWindow, "end"),
    },
    adults
  );
}

export function buildResultsUrl(values: SearchFormValues): string {
  const params = new URLSearchParams({
    origin: normalizeAirportCodeInput(values.origin),
    destination: normalizeAirportCodeInput(values.destination),
    departureStart: values.departureStart,
    departureEnd: values.departureEnd,
    arrivalStart: values.arrivalStart,
    arrivalEnd: values.arrivalEnd,
  });

  return `/results?${params.toString()}`;
}
