import assert from "node:assert/strict";
import test from "node:test";

import {
  FLIGHT_CALENDAR_CACHE_TTL_SECONDS,
  buildFlightCalendarCacheKey,
  runCachedFlightCalendar,
  type FlightCalendarCache,
} from "./flightCalendarCache.ts";

const calendar = [
  { departureDate: "2026-09-03", price: 210, currency: "EUR", hasFlights: true },
];

test("Calendar cache key scopes route, date window, flight type, stops, and currency", () => {
  const key = buildFlightCalendarCacheKey({
    origin: "dxb",
    destination: "dps",
    startDate: "2026-09-03",
    endDate: "2026-09-07",
  });
  assert.equal(
    key,
    "slowlayover:calendar:v1:DXB:DPS:2026-09-03:2026-09-07:one_way:two_stops_or_fewer:EUR",
  );
  assert.notEqual(
    key,
    buildFlightCalendarCacheKey({
      origin: "dxb",
      destination: "dps",
      startDate: "2026-09-03",
      endDate: "2026-09-07",
      stopPolicy: "nonstop",
    }),
  );
});

test("Calendar cache hits avoid the provider and misses cache the normalized response", async () => {
  let loadCalls = 0;
  let writtenTtl: number | undefined;
  const cache: FlightCalendarCache = {
    async get() {
      return null;
    },
    async set(_key, _value, ttlSeconds) {
      writtenTtl = ttlSeconds;
    },
  };

  const miss = await runCachedFlightCalendar({
    key: "calendar-key",
    cache,
    async load() {
      loadCalls += 1;
      return calendar;
    },
  });
  assert.equal(miss.cacheStatus, "MISS");
  assert.equal(loadCalls, 1);
  assert.equal(writtenTtl, FLIGHT_CALENDAR_CACHE_TTL_SECONDS);

  const hit = await runCachedFlightCalendar({
    key: "calendar-key",
    cache: { async get() { return calendar; }, async set() {} },
    async load() {
      loadCalls += 1;
      return [];
    },
  });
  assert.equal(hit.cacheStatus, "HIT");
  assert.equal(loadCalls, 1);
});

test("Calendar cache failures fall back to the provider", async () => {
  const warnings: string[] = [];
  const cache: FlightCalendarCache = {
    async get() {
      throw new Error("redis secret");
    },
    async set() {
      throw new Error("redis secret");
    },
  };

  const result = await runCachedFlightCalendar({
    key: "calendar-key",
    cache,
    async load() {
      return calendar;
    },
    warn: (message) => warnings.push(message),
  });
  assert.equal(result.cacheStatus, "MISS");
  assert.deepEqual(warnings, [
    "Flight-calendar cache read failed; proceeding without cached result.",
    "Flight-calendar cache write failed; returning fresh result.",
  ]);
});
