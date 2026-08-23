import type { DirectDestination } from "../providers/types.ts";
import { getRedisClient } from "./redis.ts";

export const DIRECT_DESTINATIONS_CACHE_TTL_SECONDS = 600;

export interface DirectDestinationsCache {
  get(key: string): Promise<DirectDestination[] | null>;
  set(
    key: string,
    value: DirectDestination[],
    ttlSeconds: number,
  ): Promise<void>;
}

export interface DirectDestinationsCacheKeyInput {
  origin: string;
  departureDate: string;
}

type WarningFunction = (message: string) => void;

function isDirectDestination(value: unknown): value is DirectDestination {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.airportCode === "string" &&
    typeof record.city === "string" &&
    typeof record.country === "string" &&
    typeof record.latitude === "number" &&
    Number.isFinite(record.latitude) &&
    typeof record.longitude === "number" &&
    Number.isFinite(record.longitude) &&
    typeof record.outboundDate === "string" &&
    (record.indicativePrice === undefined ||
      (typeof record.indicativePrice === "number" &&
        Number.isFinite(record.indicativePrice))) &&
    (record.currency === undefined || typeof record.currency === "string") &&
    (record.flightDurationMinutes === undefined ||
      (typeof record.flightDurationMinutes === "number" &&
        Number.isFinite(record.flightDurationMinutes))) &&
    (record.airlineCode === undefined || typeof record.airlineCode === "string") &&
    (record.airlineName === undefined || typeof record.airlineName === "string")
  );
}

export function buildDirectDestinationsCacheKey(
  input: DirectDestinationsCacheKeyInput,
): string {
  return [
    "slowlayover:travel-explore:v1",
    input.origin.trim().toUpperCase(),
    input.departureDate,
    "nonstop",
    "EUR",
  ].join(":");
}

export function getDirectDestinationsCache(): DirectDestinationsCache | null {
  const redis = getRedisClient();
  if (!redis) return null;

  return {
    async get(key) {
      const value = await redis.get<unknown>(key);
      return Array.isArray(value) && value.every(isDirectDestination) ? value : null;
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
  };
}

export interface CachedDirectDestinationsResult {
  value: DirectDestination[];
  cacheStatus: "HIT" | "MISS";
}

interface RunCachedDirectDestinationsOptions {
  key: string;
  cache: DirectDestinationsCache | null;
  load: () => Promise<DirectDestination[]>;
  warn?: WarningFunction;
}

export async function runCachedDirectDestinations(
  options: RunCachedDirectDestinationsOptions,
): Promise<CachedDirectDestinationsResult> {
  const warn = options.warn ?? console.warn;

  if (options.cache) {
    try {
      const cached = await options.cache.get(options.key);
      if (cached) return { value: cached, cacheStatus: "HIT" };
    } catch {
      warn("Travel Explore cache read failed; proceeding without cached result.");
    }
  }

  const value = await options.load();

  if (options.cache) {
    try {
      await options.cache.set(
        options.key,
        value,
        DIRECT_DESTINATIONS_CACHE_TTL_SECONDS,
      );
    } catch {
      warn("Travel Explore cache write failed; returning fresh result.");
    }
  }

  return { value, cacheStatus: "MISS" };
}
