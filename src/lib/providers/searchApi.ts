import { enumerateDateWindow } from "../utils/dateWindow.ts";
import type { FlightOffer, FlightSegment } from "../../types/flight.ts";

import type { FlightProvider, FlightSearchInput } from "./types.ts";

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
  // Optional server-side instrumentation for diagnostic callers. No request details
  // are passed so this cannot expose credentials through the callback.
  onRequest?: () => void;
};

class SearchApiError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, details: Omit<NormalizedSearchApiError, "message">) {
    super(message);
    this.name = "SearchApiError";
    this.status = details.status;
    this.retryable = details.retryable;
  }
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function getNonEmptyString(record: RecordValue, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getPositiveNumber(record: RecordValue, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function redactSensitiveDetails(message: string): string {
  return message
    .replace(
      /((?:authorization|api[_ -]?key|searchapi_api_key)\s*[:=]\s*)(?:bearer\s+)?[^\s,;\]}]+/gi,
      "$1[REDACTED]"
    )
    .replace(/(bearer\s+)[^\s,;\]}]+/gi, "$1[REDACTED]");
}

function isTimeoutError(error: unknown): boolean {
  return (
    (isRecord(error) && error["name"] === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function normalizeSearchApiError(error: unknown): NormalizedSearchApiError {
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
    retryable: /network|timed out|timeout|fetch failed|connection/i.test(message),
  };
}

export function getSearchApiApiKey(
  environment: Record<string, string | undefined> = process.env
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

function createLocalTimestamp(date: string | undefined, time: string | undefined): string | null {
  if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
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
  const match = /^([A-Za-z0-9]{2,3})\s*-?\s*([0-9][A-Za-z0-9]*)$/.exec(normalized);
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
  const arrivalAirport = isRecord(value.arrival_airport) ? value.arrival_airport : undefined;
  if (!departureAirport || !arrivalAirport) {
    return null;
  }

  const origin = getNonEmptyString(departureAirport, "id");
  const destination = getNonEmptyString(arrivalAirport, "id");
  const departureAt = createLocalTimestamp(
    getNonEmptyString(departureAirport, "date"),
    getNonEmptyString(departureAirport, "time")
  );
  const arrivalAt = createLocalTimestamp(
    getNonEmptyString(arrivalAirport, "date"),
    getNonEmptyString(arrivalAirport, "time")
  );
  if (!origin || !destination || !departureAt || !arrivalAt) {
    return null;
  }

  const flightNumber = parseFlightNumber(getNonEmptyString(value, "flight_number"));
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
        ].join("~")
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
  };

  return {
    id: `searchapi:${stableHash(offerSignature(normalizedOffer))}`,
    ...normalizedOffer,
  };
}

function getFlightGroups(response: RecordValue): unknown[] {
  const groups: unknown[] = [];

  for (const [key, value] of Object.entries(response)) {
    if (!Array.isArray(value)) {
      continue;
    }

    const containsFlightGroups = value.some(
      (item) => isRecord(item) && Array.isArray(item.flights)
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

async function searchExactDate(
  input: FlightSearchInput,
  departureDate: string,
  options: Required<
    Pick<SearchApiFlightProviderOptions, "apiKey" | "fetch" | "endpoint" | "timeoutMs">
  >,
  onRequest?: () => void
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
    onRequest?.();
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
    ([key, value]) => KNOWN_FLIGHT_RESULT_GROUPS.has(key) && Array.isArray(value)
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
      .filter((offer): offer is FlightOffer => offer !== null)
  );
}

export class SearchApiFlightProvider implements FlightProvider {
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
        ...(await searchExactDate(input, departureDate, searchOptions, this.options.onRequest))
      );
    }

    return deduplicateOffersById(offers);
  }
}

export function createSearchApiFlightProvider(
  options: SearchApiFlightProviderOptions = {}
): FlightProvider {
  return new SearchApiFlightProvider(options);
}

export const searchApiFlightProvider: FlightProvider = createSearchApiFlightProvider();
