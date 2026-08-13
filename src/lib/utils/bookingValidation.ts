import { isValidIsoDate, normalizeAirportCodeInput, SearchValidationError } from "./searchValidation.ts";

const MAX_BOOKING_REFERENCE_LENGTH = 2048;
const IATA_CODE_PATTERN = /^[A-Z]{3}$/;

export interface BookingOptionsRequest {
  bookingReference: string;
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
}

function getRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new SearchValidationError(`Missing ${key}.`);
  }
  return value;
}

export function validateBookingOptionsApiBody(body: unknown): BookingOptionsRequest {
  if (typeof body !== "object" || body === null) {
    throw new SearchValidationError("Request body must be an object.");
  }

  const record = body as Record<string, unknown>;
  const bookingReference = getRequiredString(record, "bookingReference").trim();
  if (!bookingReference || bookingReference.length > MAX_BOOKING_REFERENCE_LENGTH) {
    throw new SearchValidationError("Invalid bookingReference.");
  }

  const origin = normalizeAirportCodeInput(getRequiredString(record, "origin"));
  const destination = normalizeAirportCodeInput(getRequiredString(record, "destination"));
  if (!IATA_CODE_PATTERN.test(origin)) {
    throw new SearchValidationError("Use a valid origin airport code.");
  }
  if (!IATA_CODE_PATTERN.test(destination)) {
    throw new SearchValidationError("Use a valid destination airport code.");
  }
  if (origin === destination) {
    throw new SearchValidationError("Choose different airports.");
  }

  const departureDate = getRequiredString(record, "departureDate");
  if (!isValidIsoDate(departureDate)) {
    throw new SearchValidationError("Use a valid departureDate.");
  }

  const adults = record.adults === undefined ? 1 : record.adults;
  if (typeof adults !== "number" || !Number.isInteger(adults) || adults <= 0) {
    throw new SearchValidationError("Adults must be a positive integer.");
  }

  return { bookingReference, origin, destination, departureDate, adults };
}
