import assert from "node:assert/strict";
import test from "node:test";

import {
  FLIGHT_OFFERS_CACHE_TTL_SECONDS,
  buildFlightOffersCacheKey,
  runCachedFlightOffers,
  type FlightOffersCache,
} from "./flightOffersCache.ts";
import type { FlightOffer } from "../../types/flight.ts";

const offers: FlightOffer[] = [
  {
    id: "offer",
    provider: "test",
    origin: "LCA",
    destination: "ATH",
    departureAt: "2026-09-01T08:00:00",
    arrivalAt: "2026-09-01T10:00:00",
    durationMinutes: 120,
    stops: 0,
    segments: [
      {
        origin: "LCA",
        destination: "ATH",
        departureAt: "2026-09-01T08:00:00",
        arrivalAt: "2026-09-01T10:00:00",
        airlineName: "Test",
      },
    ],
    indicativePrice: { amount: 100, currency: "EUR" },
  },
];

test("detailed flight cache keys include exact route, date, adults, and search filters", () => {
  assert.equal(
    buildFlightOffersCacheKey({
      origin: "lca",
      destination: "ath",
      departureDate: "2026-09-01",
      adults: 2,
    }),
    "slowlayover:flight-offers:v1:LCA:ATH:2026-09-01:2:one_way:economy:EUR:show_cheapest_flights",
  );
});

test("detailed flight cache hits avoid the provider and misses use the five-minute TTL", async () => {
  let loads = 0;
  let ttl: number | undefined;
  const cache: FlightOffersCache = {
    async get() {
      return null;
    },
    async set(_key, _value, value) {
      ttl = value;
    },
  };

  const miss = await runCachedFlightOffers({
    key: "flight-key",
    cache,
    async load() {
      loads += 1;
      return offers;
    },
  });
  assert.equal(miss.cacheStatus, "MISS");
  assert.equal(ttl, FLIGHT_OFFERS_CACHE_TTL_SECONDS);

  const hit = await runCachedFlightOffers({
    key: "flight-key",
    cache: { async get() { return offers; }, async set() {} },
    async load() {
      loads += 1;
      return [];
    },
  });
  assert.equal(hit.cacheStatus, "HIT");
  assert.equal(loads, 1);
});
