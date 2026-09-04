import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_SEARCH_CACHE_TTL_SECONDS,
  SEARCH_CACHE_TTL_SECONDS,
  buildSearchCacheKey,
  getSearchCacheResponseHeaders,
  runCachedSearch,
} from "./searchCache.ts";
import type { SearchCache, SearchCacheValue } from "./searchCache.ts";
import type { Itinerary } from "../../types/itinerary.ts";

const resultWithItineraries: SearchCacheValue = {
  count: 1,
  itineraries: [{} as Itinerary],
  twoStopDiscovery: { explored: false, canExplore: false, reason: "unavailable" },
};

const emptyResult: SearchCacheValue = {
  count: 0,
  itineraries: [],
  twoStopDiscovery: { explored: false, canExplore: false, reason: "unavailable" },
};

test("identical normalized searches use the same versioned cache key", () => {
  const firstKey = buildSearchCacheKey({
    origin: "bne",
    destination: "lca",
    earliestDeparture: "2026-08-17",
    adults: 1,
  });
  const secondKey = buildSearchCacheKey({
    origin: "BNE",
    destination: "LCA",
    earliestDeparture: "2026-08-17",
    adults: 1,
  });

  assert.equal(firstKey, "routefinder:search:v18-reverse-explore-no-geography:BNE:LCA:2026-08-17:1:dynamic:normal");
  assert.equal(firstKey, secondKey);
});

test("cache keys differ for date, route, and adult-count changes", () => {
  const baseInput = {
    origin: "BNE",
    destination: "LCA",
    earliestDeparture: "2026-08-17",
    adults: 1,
  };
  const baseKey = buildSearchCacheKey(baseInput);

  assert.notEqual(
    buildSearchCacheKey({ ...baseInput, earliestDeparture: "2026-08-18" }),
    baseKey
  );
  assert.notEqual(buildSearchCacheKey({ ...baseInput, origin: "SYD" }), baseKey);
  assert.notEqual(
    buildSearchCacheKey({ ...baseInput, destination: "BKK" }),
    baseKey
  );
  assert.notEqual(buildSearchCacheKey({ ...baseInput, adults: 2 }), baseKey);
  assert.notEqual(buildSearchCacheKey({ ...baseInput, forceTwoStop: true }), baseKey);
});

test("a cache miss runs the planner result loader and stores successful results for five minutes", async () => {
  let loadCalls = 0;
  const writes: Array<{ key: string; value: SearchCacheValue; ttlSeconds: number }> = [];
  const cache: SearchCache = {
    async get() {
      return null;
    },
    async set(key, value, ttlSeconds) {
      writes.push({ key, value, ttlSeconds });
    },
  };

  const result = await runCachedSearch({
    key: "routefinder:search:v16:BNE:LCA:2026-08-17:1:dynamic:normal",
    cache,
    async load() {
      loadCalls += 1;
      return resultWithItineraries;
    },
  });

  assert.equal(result.cacheStatus, "MISS");
  assert.equal(loadCalls, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.ttlSeconds, SEARCH_CACHE_TTL_SECONDS);
});

test("an unconfigured cache falls back to an uncached planner result", async () => {
  let loadCalls = 0;

  const result = await runCachedSearch({
    key: "routefinder:search:v16:BNE:LCA:2026-08-17:1:dynamic:normal",
    cache: null,
    async load() {
      loadCalls += 1;
      return resultWithItineraries;
    },
  });

  assert.equal(result.cacheStatus, "MISS");
  assert.equal(loadCalls, 1);
  assert.equal(result.value, resultWithItineraries);
});

test("a cache hit returns immediately without running the planner result loader", async () => {
  let loadCalls = 0;
  const cache: SearchCache = {
    async get() {
      return resultWithItineraries;
    },
    async set() {
      throw new Error("A cache hit must not write.");
    },
  };

  const result = await runCachedSearch({
    key: "routefinder:search:v16:BNE:LCA:2026-08-17:1:dynamic:normal",
    cache,
    async load() {
      loadCalls += 1;
      return emptyResult;
    },
  });

  assert.equal(result.cacheStatus, "HIT");
  assert.equal(result.value, resultWithItineraries);
  assert.equal(loadCalls, 0);
});

test("empty search results use the short cache TTL", async () => {
  let ttlSeconds: number | undefined;
  const cache: SearchCache = {
    async get() {
      return null;
    },
    async set(_key, _value, ttl) {
      ttlSeconds = ttl;
    },
  };

  await runCachedSearch({
    key: "routefinder:search:v16:BNE:LCA:2026-08-17:1:dynamic:normal",
    cache,
    async load() {
      return emptyResult;
    },
  });

  assert.equal(ttlSeconds, EMPTY_SEARCH_CACHE_TTL_SECONDS);
});

test("failed planner searches are not cached", async () => {
  let writeCalls = 0;
  const cache: SearchCache = {
    async get() {
      return null;
    },
    async set() {
      writeCalls += 1;
    },
  };

  await assert.rejects(
    () =>
      runCachedSearch({
        key: "routefinder:search:v16:BNE:LCA:2026-08-17:1:dynamic:normal",
        cache,
        async load() {
          throw new Error("Planner failed.");
        },
      }),
    /Planner failed/
  );
  assert.equal(writeCalls, 0);
});

test("Redis read failures fall back to the planner without exposing details", async () => {
  const warnings: string[] = [];
  const cache: SearchCache = {
    async get() {
      throw new Error("redis-token-should-not-be-logged");
    },
    async set() {},
  };

  const result = await runCachedSearch({
    key: "routefinder:search:v16:BNE:LCA:2026-08-17:1:dynamic:normal",
    cache,
    async load() {
      return resultWithItineraries;
    },
    warn: (message) => warnings.push(message),
  });

  assert.equal(result.cacheStatus, "MISS");
  assert.deepEqual(warnings, [
    "Search cache read failed; proceeding without cached result.",
  ]);
  assert.doesNotMatch(warnings[0] ?? "", /redis-token-should-not-be-logged/);
});

test("Redis write failures still return the fresh planner result", async () => {
  const warnings: string[] = [];
  const cache: SearchCache = {
    async get() {
      return null;
    },
    async set() {
      throw new Error("write failed");
    },
  };

  const result = await runCachedSearch({
    key: "routefinder:search:v16:BNE:LCA:2026-08-17:1:dynamic:normal",
    cache,
    async load() {
      return resultWithItineraries;
    },
    warn: (message) => warnings.push(message),
  });

  assert.equal(result.cacheStatus, "MISS");
  assert.equal(result.value, resultWithItineraries);
  assert.deepEqual(warnings, [
    "Search cache write failed; returning fresh result.",
  ]);
});

test("cache response headers identify cache hits and misses", () => {
  assert.deepEqual(getSearchCacheResponseHeaders("HIT"), {
    "X-Routefinder-Cache": "HIT",
  });
  assert.deepEqual(getSearchCacheResponseHeaders("MISS"), {
    "X-Routefinder-Cache": "MISS",
  });
});
