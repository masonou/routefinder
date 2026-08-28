import type { FlightCalendarDay } from "../providers/types.ts";
import { getRedisClient } from "./redis.ts";

export const FLIGHT_CALENDAR_CACHE_TTL_SECONDS = 600;

export interface FlightCalendarCache {
  get(key: string): Promise<FlightCalendarDay[] | null>;
  set(
    key: string,
    value: FlightCalendarDay[],
    ttlSeconds: number,
  ): Promise<void>;
}

export interface FlightCalendarCacheKeyInput {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  stopPolicy?: "nonstop" | "two_stops_or_fewer";
}

type WarningFunction = (message: string) => void;

function isFlightCalendarDay(value: unknown): value is FlightCalendarDay {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.departureDate === "string" &&
    typeof record.currency === "string" &&
    typeof record.hasFlights === "boolean" &&
    (record.price === undefined ||
      (typeof record.price === "number" && Number.isFinite(record.price)))
  );
}

export function buildFlightCalendarCacheKey(
  input: FlightCalendarCacheKeyInput,
): string {
  return [
    "slowlayover:calendar:v1",
    input.origin.trim().toUpperCase(),
    input.destination.trim().toUpperCase(),
    input.startDate,
    input.endDate,
    "one_way",
    input.stopPolicy ?? "two_stops_or_fewer",
    "EUR",
  ].join(":");
}

export function getFlightCalendarCache(): FlightCalendarCache | null {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  return {
    async get(key) {
      const value = await redis.get<unknown>(key);
      return Array.isArray(value) && value.every(isFlightCalendarDay) ? value : null;
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
  };
}

export interface CachedFlightCalendarResult {
  value: FlightCalendarDay[];
  cacheStatus: "HIT" | "MISS";
}

interface RunCachedFlightCalendarOptions {
  key: string;
  cache: FlightCalendarCache | null;
  load: () => Promise<FlightCalendarDay[]>;
  warn?: WarningFunction;
}

export async function runCachedFlightCalendar(
  options: RunCachedFlightCalendarOptions,
): Promise<CachedFlightCalendarResult> {
  const warn = options.warn ?? console.warn;

  if (options.cache) {
    try {
      const cachedValue = await options.cache.get(options.key);
      if (cachedValue) {
        return { value: cachedValue, cacheStatus: "HIT" };
      }
    } catch {
      warn("Flight-calendar cache read failed; proceeding without cached result.");
    }
  }

  const value = await options.load();

  if (options.cache) {
    try {
      await options.cache.set(
        options.key,
        value,
        FLIGHT_CALENDAR_CACHE_TTL_SECONDS,
      );
    } catch {
      warn("Flight-calendar cache write failed; returning fresh result.");
    }
  }

  return { value, cacheStatus: "MISS" };
}
