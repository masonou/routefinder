import { Duffel } from "@duffel/api";

import { enumerateDateWindow } from "../utils/dateWindow.ts";
import type { FlightOffer, FlightSegment } from "../../types/flight.ts";

import type { FlightProvider, FlightSearchInput } from "./types.ts";

const MAX_CONCURRENT_DUFFEL_SEARCHES = 3;
const MAX_DUFFEL_ATTEMPTS = 3;
const RETRYABLE_DUFFEL_STATUSES = new Set([429, 503, 504]);
const DEFAULT_RETRY_DELAYS_MS = [500, 1000] as const;

type DuffelOfferLike = {
  id: string;
  total_amount: string;
  total_currency: string;
  slices: Array<{
    segments: Array<{
      departing_at: string;
      arriving_at: string;
      operating_carrier: {
        name: string | null;
        iata_code?: string | null;
      };
      operating_carrier_flight_number?: string | null;
      marketing_carrier_flight_number?: string | null;
      origin: {
        iata_code: string | null;
      };
      destination: {
        iata_code: string | null;
      };
    }>;
  }>;
};

type ExactDateSearcher = (
  input: FlightSearchInput,
  departureDate: string
) => Promise<FlightOffer[]>;

export interface NormalizedDuffelError {
  message: string;
  status?: number;
  requestId?: string;
  type?: string;
  code?: string;
  retryable: boolean;
  retryAfterMs?: number;
}

interface ExactDateSearchResult {
  date: string;
  offers: FlightOffer[];
  failure?: NormalizedDuffelError;
}

type DelayFunction = (milliseconds: number) => Promise<void>;
type WarningFunction = (message: string) => void;

type CreateDuffelFlightProviderOptions = {
  searchExactDate?: ExactDateSearcher;
  delay?: DelayFunction;
  warn?: WarningFunction;
  isDevelopment?: boolean;
};

type RecordValue = Record<string, unknown>;

class DuffelSearchError extends Error {
  readonly status?: number;
  readonly requestId?: string;
  readonly type?: string;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(message: string, details: NormalizedDuffelError) {
    super(message);
    this.name = "DuffelSearchError";
    this.status = details.status;
    this.requestId = details.requestId;
    this.type = details.type;
    this.code = details.code;
    this.retryable = details.retryable;
  }
}

function getDuffelClient(): Duffel {
  const accessToken = process.env.DUFFEL_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error(
      "DUFFEL_ACCESS_TOKEN is missing. Add it to .env.local before using the Duffel provider."
    );
  }

  return new Duffel({ token: accessToken });
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function getStringProperty(record: RecordValue, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getNumberProperty(record: RecordValue, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getHeadersRetryDelay(error: RecordValue): number | undefined {
  const headers = error["headers"];
  if (!isRecord(headers) && !(headers instanceof Headers)) {
    return undefined;
  }

  const getHeader = (name: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }

    const getValue = headers["get"];
    if (typeof getValue === "function") {
      const result = Reflect.apply(getValue, headers, [name]);
      return typeof result === "string" ? result : null;
    }

    return null;
  };

  const retryAfter = getHeader("retry-after");
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return retryAfterSeconds * 1000;
    }

    const retryAfterDate = Date.parse(retryAfter);
    if (!Number.isNaN(retryAfterDate)) {
      return Math.max(retryAfterDate - Date.now(), 0);
    }
  }

  const rateLimitReset = getHeader("x-ratelimit-reset");
  if (!rateLimitReset) {
    return undefined;
  }

  const resetSeconds = Number(rateLimitReset);
  if (!Number.isFinite(resetSeconds)) {
    return undefined;
  }

  return Math.max(resetSeconds * 1000 - Date.now(), 0);
}

function isRetryableNetworkError(message: string, code?: string): boolean {
  const normalizedMessage = message.toLowerCase();
  const normalizedCode = code?.toLowerCase();

  return (
    normalizedCode === "econnreset" ||
    normalizedCode === "etimedout" ||
    normalizedCode === "eai_again" ||
    normalizedCode === "enotfound" ||
    normalizedCode === "fetch_error" ||
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("socket hang up") ||
    normalizedMessage.includes("fetch failed") ||
    normalizedMessage.includes("connection reset")
  );
}

function formatNormalizedMessage(
  baseMessage: string,
  details: Pick<NormalizedDuffelError, "status" | "code" | "requestId">
): string {
  const safeBaseMessage = baseMessage.trim() || "Duffel request failed.";
  const metadata = [
    details.status !== undefined ? `status=${details.status}` : null,
    details.code ? `code=${details.code}` : null,
    details.requestId ? `requestId=${details.requestId}` : null,
  ].filter((part): part is string => part !== null);

  return metadata.length > 0
    ? `${safeBaseMessage} [${metadata.join(", ")}]`
    : safeBaseMessage;
}

export function normalizeDuffelError(error: unknown): NormalizedDuffelError {
  if (isRecord(error) && Array.isArray(error["errors"])) {
    const firstError = error["errors"][0];
    const firstErrorRecord = isRecord(firstError) ? firstError : {};
    const meta = isRecord(error["meta"]) ? error["meta"] : {};
    const code = getStringProperty(firstErrorRecord, "code");
    const status =
      getNumberProperty(meta, "status") ?? getNumberProperty(error, "status");
    const requestId =
      getStringProperty(meta, "request_id") ??
      getStringProperty(error, "requestId");
    const type = getStringProperty(firstErrorRecord, "type");
    const baseMessage =
      getStringProperty(firstErrorRecord, "message") ??
      getStringProperty(firstErrorRecord, "title") ??
      "Duffel request failed.";

    return {
      message: formatNormalizedMessage(baseMessage, {
        status,
        code,
        requestId,
      }),
      status,
      requestId,
      type,
      code,
      retryable:
        (status !== undefined && RETRYABLE_DUFFEL_STATUSES.has(status)) || false,
      retryAfterMs: getHeadersRetryDelay(error),
    };
  }

  if (error instanceof Error || isRecord(error)) {
    const record = isRecord(error) ? error : {};
    const status = getNumberProperty(record, "status");
    const requestId = getStringProperty(record, "requestId");
    const type = getStringProperty(record, "type");
    const code = getStringProperty(record, "code");
    const baseMessage =
      (error instanceof Error && error.message.trim()) ||
      getStringProperty(record, "message") ||
      "Duffel request failed.";
    const retryable =
      (status !== undefined && RETRYABLE_DUFFEL_STATUSES.has(status)) ||
      isRetryableNetworkError(baseMessage, code);

    return {
      message: formatNormalizedMessage(baseMessage, {
        status,
        code,
        requestId,
      }),
      status,
      requestId,
      type,
      code,
      retryable,
      retryAfterMs: getHeadersRetryDelay(record),
    };
  }

  return {
    message: "Unknown Duffel error.",
    retryable: false,
  };
}

function formatDateSearchMessage(
  input: FlightSearchInput,
  departureDate: string,
  details: NormalizedDuffelError
): string {
  return `Duffel search failed for ${input.origin} → ${input.destination} on ${departureDate}: ${details.message}`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getRetryDelay(
  failure: NormalizedDuffelError,
  attemptNumber: number
): number | undefined {
  if (attemptNumber >= MAX_DUFFEL_ATTEMPTS - 1) {
    return undefined;
  }

  if (failure.status === 429 && failure.retryAfterMs !== undefined) {
    return failure.retryAfterMs;
  }

  return DEFAULT_RETRY_DELAYS_MS[attemptNumber];
}

async function runExactDateSearchWithRetries(
  input: FlightSearchInput,
  departureDate: string,
  searchExactDate: ExactDateSearcher,
  delay: DelayFunction,
  warn: WarningFunction,
  isDevelopment: boolean
): Promise<ExactDateSearchResult> {
  let lastFailure: NormalizedDuffelError | undefined;

  for (let attemptNumber = 0; attemptNumber < MAX_DUFFEL_ATTEMPTS; attemptNumber += 1) {
    try {
      const offers = await searchExactDate(input, departureDate);
      return {
        date: departureDate,
        offers,
      };
    } catch (error) {
      const normalizedError = normalizeDuffelError(error);
      lastFailure = normalizedError;

      if (!normalizedError.retryable) {
        throw new DuffelSearchError(
          formatDateSearchMessage(input, departureDate, normalizedError),
          normalizedError
        );
      }

      const retryDelay = getRetryDelay(normalizedError, attemptNumber);
      if (retryDelay === undefined) {
        break;
      }

      await delay(retryDelay);
    }
  }

  const failure = lastFailure ?? {
    message: "Duffel request failed after retries.",
    retryable: true,
  };

  if (isDevelopment) {
    warn(
      `Duffel search skipped ${input.origin} → ${input.destination} on ${departureDate} after ${MAX_DUFFEL_ATTEMPTS} attempts: ${failure.message}`
    );
  }

  return {
    date: departureDate,
    offers: [],
    failure,
  };
}

function calculateDurationMinutes(departureAt: string, arrivalAt: string): number | null {
  const departure = new Date(departureAt);
  const arrival = new Date(arrivalAt);

  if (Number.isNaN(departure.getTime()) || Number.isNaN(arrival.getTime())) {
    return null;
  }

  const durationMinutes = Math.round(
    (arrival.getTime() - departure.getTime()) / (1000 * 60)
  );

  return durationMinutes > 0 ? durationMinutes : null;
}

function mapDuffelSegment(segment: DuffelOfferLike["slices"][number]["segments"][number]): FlightSegment | null {
  const origin = segment.origin.iata_code;
  const destination = segment.destination.iata_code;
  const departureAt = segment.departing_at;
  const arrivalAt = segment.arriving_at;
  const airlineName = segment.operating_carrier.name;

  if (!origin || !destination || !departureAt || !arrivalAt || !airlineName) {
    return null;
  }

  return {
    origin,
    destination,
    departureAt,
    arrivalAt,
    airlineName,
    airlineCode: segment.operating_carrier.iata_code ?? undefined,
    flightNumber:
      segment.operating_carrier_flight_number ??
      segment.marketing_carrier_flight_number ??
      undefined,
  };
}

function mapDuffelOffer(offer: DuffelOfferLike): FlightOffer | null {
  const firstSlice = offer.slices[0];
  if (!firstSlice) {
    return null;
  }

  const segments = firstSlice.segments
    .map((segment) => mapDuffelSegment(segment))
    .filter((segment): segment is FlightSegment => segment !== null);

  if (segments.length !== firstSlice.segments.length || segments.length === 0) {
    return null;
  }

  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];
  if (!firstSegment || !lastSegment) {
    return null;
  }

  const departureAt = firstSegment.departureAt;
  const arrivalAt = lastSegment.arrivalAt;
  const durationMinutes = calculateDurationMinutes(departureAt, arrivalAt);
  if (durationMinutes === null) {
    return null;
  }

  const totalAmount = Number(offer.total_amount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || !offer.total_currency) {
    return null;
  }

  return {
    id: offer.id,
    provider: "duffel",
    origin: firstSegment.origin,
    destination: lastSegment.destination,
    departureAt,
    arrivalAt,
    durationMinutes,
    stops: segments.length - 1,
    segments,
    indicativePrice: {
      amount: totalAmount,
      currency: offer.total_currency,
    },
  };
}

function createSearchExactDate(client: Duffel): ExactDateSearcher {
  return async function searchExactDate(
    input: FlightSearchInput,
    departureDate: string
  ): Promise<FlightOffer[]> {
    const response = await client.offerRequests.create({
      slices: [
        {
          origin: input.origin,
          destination: input.destination,
          departure_date: departureDate,
          departure_time: null,
          arrival_time: null,
        },
      ],
      cabin_class: "economy",
      passengers: Array.from({ length: input.adults }, () => ({ type: "adult" as const })),
      return_offers: true,
    });

    const offers = response.data.offers ?? [];
    return offers
      .map((offer) => mapDuffelOffer(offer))
      .filter((offer): offer is FlightOffer => offer !== null);
  };
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

export function createDuffelFlightProvider(
  options: CreateDuffelFlightProviderOptions = {}
): FlightProvider {
  const delay = options.delay ?? sleep;
  const warn = options.warn ?? console.warn;
  const isDevelopment = options.isDevelopment ?? process.env.NODE_ENV !== "production";

  return {
    name: "duffel",
    async searchOneWay(input: FlightSearchInput) {
      const departureDates = enumerateDateWindow(input.departureWindow);
      const searchExactDate =
        options.searchExactDate ?? createSearchExactDate(getDuffelClient());
      const offers: FlightOffer[] = [];
      const failedDates: ExactDateSearchResult[] = [];
      let successfulDates = 0;

      for (
        let chunkStart = 0;
        chunkStart < departureDates.length;
        chunkStart += MAX_CONCURRENT_DUFFEL_SEARCHES
      ) {
        const dateChunk = departureDates.slice(
          chunkStart,
          chunkStart + MAX_CONCURRENT_DUFFEL_SEARCHES
        );

        const chunkResults = await Promise.allSettled(
          dateChunk.map((departureDate) =>
            runExactDateSearchWithRetries(
              input,
              departureDate,
              searchExactDate,
              delay,
              warn,
              isDevelopment
            )
          )
        );

        for (const result of chunkResults) {
          if (result.status === "rejected") {
            throw result.reason;
          }

          offers.push(...result.value.offers);
          if (result.value.failure) {
            failedDates.push(result.value);
          } else {
            successfulDates += 1;
          }
        }
      }

      if (successfulDates > 0) {
        return deduplicateOffersById(offers);
      }

      const failedDateList = failedDates.map((result) => result.date).join(", ");
      const firstFailure =
        failedDates[0]?.failure ??
        ({
          message: "Duffel flexible-date search failed for every date.",
          retryable: true,
        } satisfies NormalizedDuffelError);

      throw new DuffelSearchError(
        `Duffel flexible-date search failed for ${input.origin} → ${input.destination} across ${departureDates.length} dates (${failedDateList}): ${firstFailure.message}`,
        firstFailure
      );
    },
  };
}

export const duffelFlightProvider: FlightProvider = createDuffelFlightProvider();
