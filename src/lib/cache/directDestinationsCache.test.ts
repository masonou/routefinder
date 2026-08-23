import assert from "node:assert/strict";
import test from "node:test";

import {
  DIRECT_DESTINATIONS_CACHE_TTL_SECONDS,
  buildDirectDestinationsCacheKey,
  runCachedDirectDestinations,
  type DirectDestinationsCache,
} from "./directDestinationsCache.ts";
import type { DirectDestination } from "../providers/types.ts";

const destinations: DirectDestination[] = [
  {
    airportCode: "DXB",
    city: "Dubai",
    country: "United Arab Emirates",
    latitude: 25.2532,
    longitude: 55.3657,
    outboundDate: "2026-09-01",
    indicativePrice: 250,
    currency: "EUR",
  },
];

test("Travel Explore cache keys scope origin, date, nonstop, and currency", () => {
  const key = buildDirectDestinationsCacheKey({
    origin: "lca",
    departureDate: "2026-09-01",
  });
  assert.equal(
    key,
    "slowlayover:travel-explore:v1:LCA:2026-09-01:nonstop:EUR",
  );
  assert.notEqual(
    buildDirectDestinationsCacheKey({ origin: "BNE", departureDate: "2026-09-01" }),
    key,
  );
  assert.notEqual(
    buildDirectDestinationsCacheKey({ origin: "LCA", departureDate: "2026-09-02" }),
    key,
  );
});

test("Travel Explore cache hits avoid the provider and misses use a ten-minute TTL", async () => {
  let loads = 0;
  let ttl: number | undefined;
  const cache: DirectDestinationsCache = {
    async get() {
      return null;
    },
    async set(_key, _value, value) {
      ttl = value;
    },
  };

  const miss = await runCachedDirectDestinations({
    key: "explore-key",
    cache,
    async load() {
      loads += 1;
      return destinations;
    },
  });
  assert.equal(miss.cacheStatus, "MISS");
  assert.equal(ttl, DIRECT_DESTINATIONS_CACHE_TTL_SECONDS);

  const hit = await runCachedDirectDestinations({
    key: "explore-key",
    cache: { async get() { return destinations; }, async set() {} },
    async load() {
      loads += 1;
      return [];
    },
  });
  assert.equal(hit.cacheStatus, "HIT");
  assert.equal(loads, 1);
});

test("Travel Explore cache failures fall back to live provider data and provider errors are not cached", async () => {
  const warnings: string[] = [];
  let writes = 0;
  const failingCache: DirectDestinationsCache = {
    async get() {
      throw new Error("redis unavailable");
    },
    async set() {
      writes += 1;
      throw new Error("redis unavailable");
    },
  };

  const result = await runCachedDirectDestinations({
    key: "explore-key",
    cache: failingCache,
    async load() {
      return destinations;
    },
    warn: (message) => warnings.push(message),
  });
  assert.deepEqual(result.value, destinations);
  assert.equal(writes, 1);
  assert.deepEqual(warnings, [
    "Travel Explore cache read failed; proceeding without cached result.",
    "Travel Explore cache write failed; returning fresh result.",
  ]);

  const cache: DirectDestinationsCache = {
    async get() {
      return null;
    },
    async set() {
      writes += 1;
    },
  };
  await assert.rejects(
    runCachedDirectDestinations({
      key: "explore-key",
      cache,
      async load() {
        throw new Error("provider unavailable");
      },
    }),
    /provider unavailable/,
  );
  assert.equal(writes, 1);
});
