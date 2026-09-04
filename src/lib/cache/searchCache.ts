import type { DynamicSearchResult } from "../../types/search.ts";
import { getRedisClient } from "./redis.ts";

export const SEARCH_CACHE_TTL_SECONDS = 300;
export const EMPTY_SEARCH_CACHE_TTL_SECONDS = 60;

// Reusing a recent planner result reduces repeated flight-provider usage and cost. Fares are
// indicative and can change, so V1 intentionally keeps this cache to five minutes.
export type SearchCacheValue = DynamicSearchResult;

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
  forceTwoStop?: boolean;
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
    record.count === record.itineraries.length &&
    typeof record.twoStopDiscovery === "object" &&
    record.twoStopDiscovery !== null
  );
}

export function buildSearchCacheKey(input: SearchCacheKeyInput): string {
  return [
    "routefinder:search:v18-reverse-explore-no-geography",
    input.origin.trim().toUpperCase(),
    input.destination.trim().toUpperCase(),
    input.earliestDeparture,
    String(Math.trunc(input.adults)),
    "dynamic",
    input.forceTwoStop === true ? "force-two-stop" : "normal",
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
  cacheReadMs: number;
  cacheWriteMs: number;
  cacheReadError: boolean;
  cacheWriteError: boolean;
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
  let cacheReadMs = 0;
  let cacheWriteMs = 0;
  let cacheReadError = false;
  let cacheWriteError = false;

  if (options.cache) {
    const startedAt = performance.now();
    try {
      const cachedValue = await options.cache.get(options.key);
      cacheReadMs = Number((performance.now() - startedAt).toFixed(2));
      if (cachedValue) {
        return { value: cachedValue, cacheStatus: "HIT", cacheReadMs, cacheWriteMs, cacheReadError, cacheWriteError };
      }
    } catch {
      cacheReadMs = Number((performance.now() - startedAt).toFixed(2));
      cacheReadError = true;
      warn("Search cache read failed; proceeding without cached result.");
    }
  }

  const value = await options.load();

  if (options.cache) {
    const ttlSeconds =
      value.itineraries.length === 0
        ? EMPTY_SEARCH_CACHE_TTL_SECONDS
        : SEARCH_CACHE_TTL_SECONDS;

    const startedAt = performance.now();
    try {
      await options.cache.set(options.key, value, ttlSeconds);
    } catch {
      cacheWriteError = true;
      warn("Search cache write failed; returning fresh result.");
    } finally {
      cacheWriteMs = Number((performance.now() - startedAt).toFixed(2));
    }
  }

  return { value, cacheStatus: "MISS", cacheReadMs, cacheWriteMs, cacheReadError, cacheWriteError };
}

export function getSearchCacheResponseHeaders(
  cacheStatus: CachedSearchResult["cacheStatus"]
): Record<string, string> {
  return { "X-Routefinder-Cache": cacheStatus };
}
