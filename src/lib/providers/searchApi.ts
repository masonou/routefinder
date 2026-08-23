import { enumerateDateWindow } from "../utils/dateWindow.ts";
import type { FlightOffer, FlightSegment } from "../../types/flight.ts";
import type { BookingOption } from "../../types/booking.ts";

import type {
  BookingOptionsInput,
  BookingOptionsProvider,
  DirectDestination,
  DirectDestinationsInput,
  DirectDestinationsProvider,
  FlightCalendarDay,
  FlightCalendarInput,
  FlightCalendarProvider,
  FlightProvider,
  FlightSearchInput,
} from "./types.ts";

const SEARCH_API_URL = "https://www.searchapi.io/api/v1/search";
const SEARCH_API_TIMEOUT_MS = 15_000;
const KNOWN_FLIGHT_RESULT_GROUPS = new Set([
  "best_flights",
  "other_flights",
  "cheapest_flights",
  "hidden_flights",
]);

type RecordValue = Record<string, unknown>;
type FetchFunction = typeof fetch;

export interface NormalizedSearchApiError {
  message: string;
  status?: number;
  retryable: boolean;
}

export type SearchApiFlightProviderOptions = {
  apiKey?: string;
  fetch?: FetchFunction;
  endpoint?: string;
  timeoutMs?: number;
};

class SearchApiError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    details: Omit<NormalizedSearchApiError, "message">,
  ) {
    super(message);
    this.name = "SearchApiError";
    this.status = details.status;
    this.retryable = details.retryable;
  }
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function getNonEmptyString(
  record: RecordValue,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getPositiveNumber(
  record: RecordValue,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function getNonNegativeNumber(
  record: RecordValue,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function getCoordinates(
  value: unknown,
): { latitude: number; longitude: number } | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const [latitude, longitude] = value;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function getStringArray(
  record: RecordValue,
  key: string,
): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter(
    (item): item is string => typeof item === "string" && Boolean(item.trim()),
  );
}

function redactSensitiveDetails(message: string): string {
  return message
    .replace(
      /((?:authorization|api[_ -]?key|searchapi_api_key)\s*[:=]\s*)(?:bearer\s+)?[^\s,;\]}]+/gi,
      "$1[REDACTED]",
    )
    .replace(/(bearer\s+)[^\s,;\]}]+/gi, "$1[REDACTED]");
}

function isTimeoutError(error: unknown): boolean {
  return (
    (isRecord(error) && error["name"] === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function normalizeSearchApiError(
  error: unknown,
): NormalizedSearchApiError {
  if (error instanceof SearchApiError) {
    return {
      message: redactSensitiveDetails(error.message),
      status: error.status,
      retryable: error.retryable,
    };
  }

  if (isTimeoutError(error)) {
    return {
      message: "SearchAPI request timed out.",
      status: 504,
      retryable: true,
    };
  }

  const message =
    error instanceof Error && error.message.trim()
      ? redactSensitiveDetails(error.message)
      : "SearchAPI request failed.";

  return {
    message,
    retryable: /network|timed out|timeout|fetch failed|connection/i.test(
      message,
    ),
  };
}

export function getSearchApiApiKey(
  environment: Record<string, string | undefined> = process.env,
): string {
  const apiKey = environment.SEARCHAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new SearchApiError("SEARCHAPI_API_KEY is not configured.", {
      status: 500,
      retryable: false,
    });
  }

  return apiKey;
}

function createLocalTimestamp(
  date: string | undefined,
  time: string | undefined,
): string | null {
  if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return null;
  }

  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!timeMatch) {
    return null;
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  // SearchAPI provides airport-local values, not UTC instants. Deliberately retain
  // the local date/time and omit a timezone suffix so planner calendar dates stay local.
  return `${date}T${timeMatch[1]}:${timeMatch[2]}:${String(second).padStart(2, "0")}`;
}

function parseFlightNumber(value: string | undefined): {
  airlineCode?: string;
  flightNumber?: string;
} {
  if (!value) {
    return {};
  }

  const normalized = value.trim();
  const match = /^([A-Za-z0-9]{2,3})\s*-?\s*([0-9][A-Za-z0-9]*)$/.exec(
    normalized,
  );
  if (!match) {
    return { flightNumber: normalized };
  }

  return {
    airlineCode: match[1].toUpperCase(),
    flightNumber: match[2],
  };
}

function mapSearchApiSegment(value: unknown): FlightSegment | null {
  if (!isRecord(value)) {
    return null;
  }

  const departureAirport = isRecord(value.departure_airport)
    ? value.departure_airport
    : undefined;
  const arrivalAirport = isRecord(value.arrival_airport)
    ? value.arrival_airport
    : undefined;
  if (!departureAirport || !arrivalAirport) {
    return null;
  }

  const origin = getNonEmptyString(departureAirport, "id");
  const destination = getNonEmptyString(arrivalAirport, "id");
  const departureAt = createLocalTimestamp(
    getNonEmptyString(departureAirport, "date"),
    getNonEmptyString(departureAirport, "time"),
  );
  const arrivalAt = createLocalTimestamp(
    getNonEmptyString(arrivalAirport, "date"),
    getNonEmptyString(arrivalAirport, "time"),
  );
  if (!origin || !destination || !departureAt || !arrivalAt) {
    return null;
  }

  const flightNumber = parseFlightNumber(
    getNonEmptyString(value, "flight_number"),
  );
  return {
    origin,
    destination,
    departureAt,
    arrivalAt,
    airlineName: getNonEmptyString(value, "airline") ?? "Unknown airline",
    ...flightNumber,
  };
}

function offerSignature(offer: Omit<FlightOffer, "id">): string {
  return [
    offer.origin,
    offer.destination,
    offer.departureAt,
    offer.arrivalAt,
    offer.segments
      .map((segment) =>
        [
          segment.origin,
          segment.destination,
          segment.departureAt,
          segment.arrivalAt,
          segment.airlineCode ?? "",
          segment.flightNumber ?? "",
          segment.airlineName,
        ].join("~"),
      )
      .join("|"),
    offer.indicativePrice.amount,
    offer.indicativePrice.currency,
  ].join("|");
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

function mapSearchApiOffer(value: unknown): FlightOffer | null {
  if (!isRecord(value) || !Array.isArray(value.flights)) {
    return null;
  }

  const segments = value.flights
    .map((flight) => mapSearchApiSegment(flight))
    .filter((segment): segment is FlightSegment => segment !== null);
  if (segments.length === 0 || segments.length !== value.flights.length) {
    return null;
  }

  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];
  const durationMinutes = getPositiveNumber(value, "total_duration");
  const price = getPositiveNumber(value, "price");
  if (!firstSegment || !lastSegment || !durationMinutes || !price) {
    return null;
  }

  const normalizedOffer: Omit<FlightOffer, "id"> = {
    provider: "searchapi",
    origin: firstSegment.origin,
    destination: lastSegment.destination,
    departureAt: firstSegment.departureAt,
    arrivalAt: lastSegment.arrivalAt,
    durationMinutes,
    stops: segments.length - 1,
    segments,
    indicativePrice: {
      amount: price,
      currency: "EUR",
    },
    bookingReference: getNonEmptyString(value, "booking_token"),
  };

  return {
    id: `searchapi:${stableHash(offerSignature(normalizedOffer))}`,
    ...normalizedOffer,
  };
}

function mapSearchApiBookingOption(value: unknown): BookingOption | null {
  if (!isRecord(value)) {
    return null;
  }

  const isSplitBooking = value.is_split_booking === true;
  const sellerName =
    getNonEmptyString(value, "book_with") ??
    (isSplitBooking ? "Split booking" : undefined);
  const amount = getNonNegativeNumber(value, "price");
  if (!sellerName || amount === undefined) {
    return null;
  }

  const baggagePrices = getStringArray(value, "baggage_prices");

  // SearchAPI booking_request represents the Google Flights booking action.
  // Slow Layover does not use it yet because affiliate-link strategy has not
  // been decided.
  return {
    sellerName,
    price: { amount, currency: "EUR" },
    flightNumbers: getStringArray(value, "flight_numbers") ?? [],
    ...(getNonEmptyString(value, "fare_type")
      ? { fareType: getNonEmptyString(value, "fare_type") }
      : {}),
    ...(getNonEmptyString(value, "option_title")
      ? { optionTitle: getNonEmptyString(value, "option_title") }
      : {}),
    ...(baggagePrices ? { baggagePrices } : {}),
    ...(isSplitBooking ? { isSplitBooking: true } : {}),
  };
}

function getFlightGroups(response: RecordValue): unknown[] {
  const groups: unknown[] = [];

  for (const [key, value] of Object.entries(response)) {
    if (!Array.isArray(value)) {
      continue;
    }

    const containsFlightGroups = value.some(
      (item) => isRecord(item) && Array.isArray(item.flights),
    );
    if (KNOWN_FLIGHT_RESULT_GROUPS.has(key) || containsFlightGroups) {
      groups.push(...value);
    }
  }

  return groups;
}

function deduplicateOffersById(offers: FlightOffer[]): FlightOffer[] {
  const uniqueOffers = new Map<string, FlightOffer>();
  for (const offer of offers) {
    if (!uniqueOffers.has(offer.id)) {
      uniqueOffers.set(offer.id, offer);
    }
  }

  return Array.from(uniqueOffers.values());
}

function mapSearchApiExploreDestination(
  value: unknown,
): DirectDestination | null {
  if (!isRecord(value) || !isRecord(value.flight) || value.flight.stops !== 0) {
    return null;
  }

  const airportCode = getNonEmptyString(
    value.flight,
    "airport_code",
  )?.toUpperCase();
  const city =
    getNonEmptyString(value.flight, "city") ?? getNonEmptyString(value, "name");
  const country = getNonEmptyString(value, "country");
  const coordinates = getCoordinates(value.coordinates);
  const outboundDate = getNonEmptyString(value, "outbound_date");
  if (!airportCode || !city || !country || !coordinates || !outboundDate) {
    return null;
  }

  const indicativePrice = getNonNegativeNumber(value.flight, "price");
  const flightDurationMinutes = getPositiveNumber(
    value.flight,
    "flight_duration_minutes",
  );

  return {
    airportCode,
    city,
    country,
    ...coordinates,
    outboundDate,
    ...(indicativePrice === undefined ? {} : { indicativePrice }),
    ...(indicativePrice === undefined ? {} : { currency: "EUR" }),
    ...(flightDurationMinutes === undefined ? {} : { flightDurationMinutes }),
    ...(getNonEmptyString(value.flight, "airline_code")
      ? {
          airlineCode: getNonEmptyString(
            value.flight,
            "airline_code",
          )?.toUpperCase(),
        }
      : {}),
    ...(getNonEmptyString(value.flight, "airline_name")
      ? { airlineName: getNonEmptyString(value.flight, "airline_name") }
      : {}),
  };
}

function preferDirectDestination(
  current: DirectDestination,
  next: DirectDestination,
): DirectDestination {
  const currentPrice = current.indicativePrice ?? Number.POSITIVE_INFINITY;
  const nextPrice = next.indicativePrice ?? Number.POSITIVE_INFINITY;
  if (nextPrice !== currentPrice) {
    return nextPrice < currentPrice ? next : current;
  }

  const currentDuration =
    current.flightDurationMinutes ?? Number.POSITIVE_INFINITY;
  const nextDuration = next.flightDurationMinutes ?? Number.POSITIVE_INFINITY;
  return nextDuration < currentDuration ? next : current;
}

function deduplicateDirectDestinations(
  destinations: DirectDestination[],
): DirectDestination[] {
  const unique = new Map<string, DirectDestination>();
  for (const destination of destinations) {
    const existing = unique.get(destination.airportCode);
    unique.set(
      destination.airportCode,
      existing ? preferDirectDestination(existing, destination) : destination,
    );
  }
  return Array.from(unique.values());
}

async function fetchDirectDestinations(
  input: DirectDestinationsInput,
  options: Required<
    Pick<
      SearchApiFlightProviderOptions,
      "apiKey" | "fetch" | "endpoint" | "timeoutMs"
    >
  >,
): Promise<DirectDestination[]> {
  const query = new URLSearchParams({
    engine: "google_travel_explore",
    departure_id: input.origin.trim().toUpperCase(),
    time_period: input.departureDate,
    travel_mode: "flights_only",
    stops: "nonstop",
    currency: "EUR",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  let response: Response;
  try {
    response = await options.fetch(`${options.endpoint}?${query.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${options.apiKey}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (isTimeoutError(error) || controller.signal.aborted) {
      throw new SearchApiError("SearchAPI request timed out.", {
        status: 504,
        retryable: true,
      });
    }
    throw new SearchApiError("SearchAPI network request failed.", {
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? "SearchAPI authentication failed."
        : response.status === 429
          ? "SearchAPI rate limit exceeded."
          : response.status >= 500
            ? "SearchAPI service is unavailable."
            : "SearchAPI request failed.";
    throw new SearchApiError(message, {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SearchApiError("SearchAPI returned invalid JSON.", {
      status: 502,
      retryable: false,
    });
  }

  if (!isRecord(body) || !Array.isArray(body.destinations)) {
    throw new SearchApiError("SearchAPI returned an unexpected response.", {
      status: 502,
      retryable: false,
    });
  }

  return deduplicateDirectDestinations(
    body.destinations
      .map((destination) => mapSearchApiExploreDestination(destination))
      .filter(
        (destination): destination is DirectDestination => destination !== null,
      ),
  );
}

function mapSearchApiCalendarDay(value: unknown): FlightCalendarDay | null {
  if (!isRecord(value)) {
    return null;
  }

  const departureDate = getNonEmptyString(value, "departure");
  if (!departureDate || !isIsoDate(departureDate)) {
    return null;
  }

  if (value.has_no_flights === true) {
    return { departureDate, currency: "EUR", hasFlights: false };
  }

  const price = getNonNegativeNumber(value, "price");
  return {
    departureDate,
    currency: "EUR",
    hasFlights: true,
    ...(price === undefined ? {} : { price }),
  };
}

async function fetchFlightCalendar(
  input: FlightCalendarInput,
  options: Required<
    Pick<
      SearchApiFlightProviderOptions,
      "apiKey" | "fetch" | "endpoint" | "timeoutMs"
    >
  >,
): Promise<FlightCalendarDay[]> {
  const query = new URLSearchParams({
    engine: "google_flights_calendar",
    flight_type: "one_way",
    departure_id: input.origin.trim().toUpperCase(),
    arrival_id: input.destination.trim().toUpperCase(),
    outbound_date: input.departureWindow.start,
    outbound_date_start: input.departureWindow.start,
    outbound_date_end: input.departureWindow.end,
    stops: "two_stops_or_fewer",
    currency: "EUR",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  let response: Response;
  try {
    response = await options.fetch(`${options.endpoint}?${query.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${options.apiKey}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (isTimeoutError(error) || controller.signal.aborted) {
      throw new SearchApiError("SearchAPI request timed out.", {
        status: 504,
        retryable: true,
      });
    }
    throw new SearchApiError("SearchAPI network request failed.", {
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? "SearchAPI authentication failed."
        : response.status === 429
          ? "SearchAPI rate limit exceeded."
          : response.status >= 500
            ? "SearchAPI service is unavailable."
            : "SearchAPI request failed.";
    throw new SearchApiError(message, {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SearchApiError("SearchAPI returned invalid JSON.", {
      status: 502,
      retryable: false,
    });
  }

  if (!isRecord(body) || !Array.isArray(body.calendar)) {
    throw new SearchApiError("SearchAPI returned an unexpected response.", {
      status: 502,
      retryable: false,
    });
  }

  return body.calendar
    .map((entry) => mapSearchApiCalendarDay(entry))
    .filter((entry): entry is FlightCalendarDay => entry !== null);
}

async function searchExactDate(
  input: FlightSearchInput,
  departureDate: string,
  options: Required<
    Pick<
      SearchApiFlightProviderOptions,
      "apiKey" | "fetch" | "endpoint" | "timeoutMs"
    >
  >,
): Promise<FlightOffer[]> {
  const query = new URLSearchParams({
    engine: "google_flights",
    flight_type: "one_way",
    departure_id: input.origin,
    arrival_id: input.destination,
    outbound_date: departureDate,
    adults: String(input.adults),
    travel_class: "economy",
    currency: "EUR",
    show_cheapest_flights: "true",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  let response: Response;
  try {
    response = await options.fetch(`${options.endpoint}?${query.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (isTimeoutError(error) || controller.signal.aborted) {
      throw new SearchApiError("SearchAPI request timed out.", {
        status: 504,
        retryable: true,
      });
    }

    throw new SearchApiError("SearchAPI network request failed.", {
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? "SearchAPI authentication failed."
        : response.status === 429
          ? "SearchAPI rate limit exceeded."
          : response.status >= 500
            ? "SearchAPI service is unavailable."
            : "SearchAPI request failed.";
    throw new SearchApiError(message, {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SearchApiError("SearchAPI returned invalid JSON.", {
      status: 502,
      retryable: false,
    });
  }

  if (!isRecord(body)) {
    throw new SearchApiError("SearchAPI returned an unexpected response.", {
      status: 502,
      retryable: false,
    });
  }

  const groups = getFlightGroups(body);
  const hasFlightResultArray = Object.entries(body).some(
    ([key, value]) =>
      KNOWN_FLIGHT_RESULT_GROUPS.has(key) && Array.isArray(value),
  );
  if (groups.length === 0 && !hasFlightResultArray) {
    throw new SearchApiError("SearchAPI returned an unexpected response.", {
      status: 502,
      retryable: false,
    });
  }

  return deduplicateOffersById(
    groups
      .map((group) => mapSearchApiOffer(group))
      .filter((offer): offer is FlightOffer => offer !== null),
  );
}

async function fetchBookingOptions(
  input: BookingOptionsInput,
  options: Required<
    Pick<
      SearchApiFlightProviderOptions,
      "apiKey" | "fetch" | "endpoint" | "timeoutMs"
    >
  >,
): Promise<BookingOption[]> {
  const query = new URLSearchParams({
    engine: "google_flights",
    flight_type: "one_way",
    departure_id: input.origin,
    arrival_id: input.destination,
    outbound_date: input.departureDate,
    booking_token: input.bookingReference,
    adults: String(input.adults),
    currency: "EUR",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  let response: Response;
  try {
    response = await options.fetch(`${options.endpoint}?${query.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${options.apiKey}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (isTimeoutError(error) || controller.signal.aborted) {
      throw new SearchApiError("SearchAPI request timed out.", {
        status: 504,
        retryable: true,
      });
    }
    throw new SearchApiError("SearchAPI network request failed.", {
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? "SearchAPI authentication failed."
        : response.status === 429
          ? "SearchAPI rate limit exceeded."
          : response.status >= 500
            ? "SearchAPI service is unavailable."
            : "SearchAPI request failed.";
    throw new SearchApiError(message, {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SearchApiError("SearchAPI returned invalid JSON.", {
      status: 502,
      retryable: false,
    });
  }

  if (!isRecord(body) || !Array.isArray(body.booking_options)) {
    throw new SearchApiError("SearchAPI returned an unexpected response.", {
      status: 502,
      retryable: false,
    });
  }

  return body.booking_options
    .map((option) => mapSearchApiBookingOption(option))
    .filter((option): option is BookingOption => option !== null);
}

export class SearchApiFlightProvider
  implements
    FlightProvider,
    BookingOptionsProvider,
    DirectDestinationsProvider,
    FlightCalendarProvider
{
  readonly name = "searchapi";
  private readonly options: SearchApiFlightProviderOptions;

  constructor(options: SearchApiFlightProviderOptions = {}) {
    this.options = options;
  }

  async searchOneWay(input: FlightSearchInput): Promise<FlightOffer[]> {
    const apiKey = this.options.apiKey?.trim() || getSearchApiApiKey();
    const searchOptions = {
      apiKey,
      fetch: this.options.fetch ?? globalThis.fetch,
      endpoint: this.options.endpoint ?? SEARCH_API_URL,
      timeoutMs: this.options.timeoutMs ?? SEARCH_API_TIMEOUT_MS,
    };
    const departureDates = enumerateDateWindow(input.departureWindow);
    const offers: FlightOffer[] = [];

    for (const departureDate of departureDates) {
      offers.push(
        ...(await searchExactDate(input, departureDate, searchOptions)),
      );
    }

    return deduplicateOffersById(offers);
  }

  async getBookingOptions(
    input: BookingOptionsInput,
  ): Promise<BookingOption[]> {
    const apiKey = this.options.apiKey?.trim() || getSearchApiApiKey();
    return fetchBookingOptions(input, {
      apiKey,
      fetch: this.options.fetch ?? globalThis.fetch,
      endpoint: this.options.endpoint ?? SEARCH_API_URL,
      timeoutMs: this.options.timeoutMs ?? SEARCH_API_TIMEOUT_MS,
    });
  }

  async getDirectDestinations(
    input: DirectDestinationsInput,
  ): Promise<DirectDestination[]> {
    const apiKey = this.options.apiKey?.trim() || getSearchApiApiKey();
    return fetchDirectDestinations(input, {
      apiKey,
      fetch: this.options.fetch ?? globalThis.fetch,
      endpoint: this.options.endpoint ?? SEARCH_API_URL,
      timeoutMs: this.options.timeoutMs ?? SEARCH_API_TIMEOUT_MS,
    });
  }

  async getFlightCalendar(
    input: FlightCalendarInput,
  ): Promise<FlightCalendarDay[]> {
    const apiKey = this.options.apiKey?.trim() || getSearchApiApiKey();
    return fetchFlightCalendar(input, {
      apiKey,
      fetch: this.options.fetch ?? globalThis.fetch,
      endpoint: this.options.endpoint ?? SEARCH_API_URL,
      timeoutMs: this.options.timeoutMs ?? SEARCH_API_TIMEOUT_MS,
    });
  }
}

export function createSearchApiFlightProvider(
  options: SearchApiFlightProviderOptions = {},
): SearchApiFlightProvider {
  return new SearchApiFlightProvider(options);
}

const defaultSearchApiProvider = createSearchApiFlightProvider();

export const searchApiFlightProvider: FlightProvider = defaultSearchApiProvider;

export const searchApiBookingOptionsProvider: BookingOptionsProvider =
  defaultSearchApiProvider;

export const searchApiDirectDestinationsProvider: DirectDestinationsProvider =
  defaultSearchApiProvider;

export const searchApiFlightCalendarProvider: FlightCalendarProvider =
  defaultSearchApiProvider;
