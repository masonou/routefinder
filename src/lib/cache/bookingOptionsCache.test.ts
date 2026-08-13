import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOKING_OPTIONS_CACHE_TTL_SECONDS,
  buildBookingOptionsCacheKey,
  runCachedBookingOptions,
} from "./bookingOptionsCache.ts";
import type { BookingOptionsCache } from "./bookingOptionsCache.ts";

const options = [
  {
    sellerName: "Example seller",
    price: { amount: 123, currency: "EUR" },
    flightNumbers: ["EX 1"],
  },
];

test("booking-options cache keys hash the opaque booking reference", () => {
  const key = buildBookingOptionsCacheKey("opaque-reference");
  assert.match(key, /^slowlayover:booking:v1:[a-f0-9]{64}$/);
  assert.doesNotMatch(key, /opaque-reference/);
  assert.equal(key, buildBookingOptionsCacheKey("opaque-reference"));
  assert.notEqual(key, buildBookingOptionsCacheKey("another-reference"));
});

test("booking-options cache HIT avoids the provider loader", async () => {
  let loaderCalls = 0;
  const cache: BookingOptionsCache = {
    async get() {
      return options;
    },
    async set() {
      throw new Error("cache hits must not write");
    },
  };

  const result = await runCachedBookingOptions({
    key: "cache-key",
    cache,
    async load() {
      loaderCalls += 1;
      return [];
    },
  });

  assert.equal(result.cacheStatus, "HIT");
  assert.equal(loaderCalls, 0);
  assert.deepEqual(result.value, options);
});

test("booking-options cache MISS calls the provider loader and caches for five minutes", async () => {
  let loaderCalls = 0;
  let writtenTtl: number | undefined;
  const cache: BookingOptionsCache = {
    async get() {
      return null;
    },
    async set(_key, _value, ttlSeconds) {
      writtenTtl = ttlSeconds;
    },
  };

  const result = await runCachedBookingOptions({
    key: "cache-key",
    cache,
    async load() {
      loaderCalls += 1;
      return options;
    },
  });

  assert.equal(result.cacheStatus, "MISS");
  assert.equal(loaderCalls, 1);
  assert.equal(writtenTtl, BOOKING_OPTIONS_CACHE_TTL_SECONDS);
});

test("Redis failures fall back to the booking-options provider", async () => {
  const warnings: string[] = [];
  let loaderCalls = 0;
  const cache: BookingOptionsCache = {
    async get() {
      throw new Error("redis secret");
    },
    async set() {
      throw new Error("redis secret");
    },
  };

  const result = await runCachedBookingOptions({
    key: "cache-key",
    cache,
    async load() {
      loaderCalls += 1;
      return options;
    },
    warn: (message) => warnings.push(message),
  });

  assert.equal(loaderCalls, 1);
  assert.deepEqual(result.value, options);
  assert.deepEqual(warnings, [
    "Booking-options cache read failed; proceeding without cached result.",
    "Booking-options cache write failed; returning fresh result.",
  ]);
  assert.doesNotMatch(warnings.join(" "), /redis secret/);
});
