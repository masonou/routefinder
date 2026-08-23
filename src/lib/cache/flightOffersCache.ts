import type { FlightOffer } from "../../types/flight.ts";
import { getRedisClient } from "./redis.ts";

export const FLIGHT_OFFERS_CACHE_TTL_SECONDS = 300;

export interface FlightOffersCache {
  get(key: string): Promise<FlightOffer[] | null>;
  set(key: string, value: FlightOffer[], ttlSeconds: number): Promise<void>;
}

export interface FlightOffersCacheKeyInput {
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
}

type WarningFunction = (message: string) => void;

function isFlightOffer(value: unknown): value is FlightOffer {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const price = record.indicativePrice;
  return (
    typeof record.id === "string" &&
    typeof record.origin === "string" &&
    typeof record.destination === "string" &&
    typeof record.departureAt === "string" &&
    typeof record.arrivalAt === "string" &&
    typeof record.durationMinutes === "number" &&
    typeof record.stops === "number" &&
    Array.isArray(record.segments) &&
    typeof price === "object" &&
    price !== null &&
    typeof (price as Record<string, unknown>).amount === "number" &&
    typeof (price as Record<string, unknown>).currency === "string"
  );
}

export function buildFlightOffersCacheKey(input: FlightOffersCacheKeyInput): string {
  return [
    "slowlayover:flight-offers:v1",
    input.origin.trim().toUpperCase(),
    input.destination.trim().toUpperCase(),
    input.departureDate,
    String(Math.trunc(input.adults)),
    "one_way",
    "economy",
    "EUR",
    "show_cheapest_flights",
  ].join(":");
}

export function getFlightOffersCache(): FlightOffersCache | null {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  return {
    async get(key) {
      const value = await redis.get<unknown>(key);
      return Array.isArray(value) && value.every(isFlightOffer) ? value : null;
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
  };
}

export interface CachedFlightOffersResult {
  value: FlightOffer[];
  cacheStatus: "HIT" | "MISS";
}

interface RunCachedFlightOffersOptions {
  key: string;
  cache: FlightOffersCache | null;
  load: () => Promise<FlightOffer[]>;
  warn?: WarningFunction;
}

export async function runCachedFlightOffers(
  options: RunCachedFlightOffersOptions,
): Promise<CachedFlightOffersResult> {
  const warn = options.warn ?? console.warn;

  if (options.cache) {
    try {
      const cached = await options.cache.get(options.key);
      if (cached) {
        return { value: cached, cacheStatus: "HIT" };
      }
    } catch {
      warn("Flight-offers cache read failed; proceeding without cached result.");
    }
  }

  const value = await options.load();

  if (options.cache) {
    try {
      await options.cache.set(options.key, value, FLIGHT_OFFERS_CACHE_TTL_SECONDS);
    } catch {
      warn("Flight-offers cache write failed; returning fresh result.");
    }
  }

  return { value, cacheStatus: "MISS" };
}
