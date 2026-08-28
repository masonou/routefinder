import type { Itinerary } from "../../types/itinerary.ts";
import { getRedisClient } from "./redis.ts";

export const SEARCH_CACHE_TTL_SECONDS = 300;
export const EMPTY_SEARCH_CACHE_TTL_SECONDS = 60;

// Reusing a recent planner result reduces repeated flight-provider usage and cost. Fares are
// indicative and can change, so V1 intentionally keeps this cache to five minutes.
export interface SearchCacheValue {
  count: number;
  itineraries: Itinerary[];
}

export interface SearchCache {
  get(key: string): Promise<SearchCacheValue | null>;
  set(
    key: string,
    value: SearchCacheValue,
    ttlSeconds: number
  ): Promise<void>;
}

interface SearchCacheKeyInput {
  origin: string;
  destination: string;
  earliestDeparture: string;
  adults: number;
}

type WarningFunction = (message: string) => void;

function isSearchCacheValue(value: unknown): value is SearchCacheValue {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.count) &&
    Array.isArray(record.itineraries) &&
    record.count === record.itineraries.length
  );
}

export type SearchPlannerMode = "dynamic" | "legacy";

export function buildSearchCacheKey(
  input: SearchCacheKeyInput,
  plannerMode: SearchPlannerMode = "legacy",
): string {
  return [
    "routefinder:search:v7",
    input.origin.trim().toUpperCase(),
    input.destination.trim().toUpperCase(),
    input.earliestDeparture,
    String(Math.trunc(input.adults)),
    plannerMode,
  ].join(":");
}

export function getSearchCache(): SearchCache | null {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  return {
    async get(key) {
      const value = await redis.get<unknown>(key);
      return isSearchCacheValue(value) ? value : null;
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
  };
}

export interface CachedSearchResult {
  value: SearchCacheValue;
  cacheStatus: "HIT" | "MISS";
}

interface RunCachedSearchOptions {
  key: string;
  cache: SearchCache | null;
  load: () => Promise<SearchCacheValue>;
  warn?: WarningFunction;
}

export async function runCachedSearch(
  options: RunCachedSearchOptions
): Promise<CachedSearchResult> {
  const warn = options.warn ?? console.warn;

  if (options.cache) {
    try {
      const cachedValue = await options.cache.get(options.key);
      if (cachedValue) {
        return { value: cachedValue, cacheStatus: "HIT" };
      }
    } catch {
      warn("Search cache read failed; proceeding without cached result.");
    }
  }

  const value = await options.load();

  if (options.cache) {
    const ttlSeconds =
      value.itineraries.length === 0
        ? EMPTY_SEARCH_CACHE_TTL_SECONDS
        : SEARCH_CACHE_TTL_SECONDS;

    try {
      await options.cache.set(options.key, value, ttlSeconds);
    } catch {
      warn("Search cache write failed; returning fresh result.");
    }
  }

  return { value, cacheStatus: "MISS" };
}

export function getSearchCacheResponseHeaders(
  cacheStatus: CachedSearchResult["cacheStatus"]
): Record<string, string> {
  return { "X-Routefinder-Cache": cacheStatus };
}
