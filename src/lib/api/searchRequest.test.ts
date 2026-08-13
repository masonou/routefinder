import assert from "node:assert/strict";
import test from "node:test";

import { runSearchRequest } from "./searchRequest.ts";
import { SearchApiFlightProvider } from "../providers/searchApi.ts";
import type { SearchCache } from "../cache/searchCache.ts";
import type { FlightProvider } from "../providers/types.ts";
import type { Itinerary } from "../../types/itinerary.ts";
import type { TripRequest } from "../../types/trip.ts";

function searchRequest(body: unknown): Request {
  return new Request("http://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function searchInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    origin: "BNE",
    destination: "LCA",
    earliestDeparture: "2099-08-17",
    adults: 1,
    ...overrides,
  };
}

test("public searches use the SearchAPI provider with the existing D through D+3 window", async () => {
  let receivedRequest: TripRequest | undefined;
  let receivedProvider: FlightProvider | undefined;

  const result = await runSearchRequest(searchRequest(searchInput()), {
    cache: null,
    async planTrip(request, provider) {
      receivedRequest = request;
      receivedProvider = provider;
      return [];
    },
  });

  assert.equal(result.status, 200);
  assert.ok(receivedProvider instanceof SearchApiFlightProvider);
  assert.deepEqual(receivedRequest?.departureWindow, {
    start: "2099-08-17",
    end: "2099-08-20",
  });
  assert.equal("arrivalWindow" in (receivedRequest ?? {}), false);
  if (!("headers" in result)) {
    throw new Error("Expected cache headers on a successful result.");
  }
  assert.deepEqual(result.headers, { "X-Routefinder-Cache": "MISS" });
  assert.deepEqual(result.body, { count: 0, itineraries: [] });
});

test("a cache hit returns cached data without invoking the planner or provider", async () => {
  let plannerCalls = 0;
  const cachedItineraries = [{} as Itinerary];
  const cache: SearchCache = {
    async get() {
      return { count: 1, itineraries: cachedItineraries };
    },
    async set() {
      throw new Error("Cache hits must not write.");
    },
  };

  const result = await runSearchRequest(searchRequest(searchInput()), {
    cache,
    async planTrip() {
      plannerCalls += 1;
      return [];
    },
  });

  assert.equal(result.status, 200);
  assert.equal(plannerCalls, 0);
  if (!("headers" in result)) {
    throw new Error("Expected cache headers on a successful result.");
  }
  assert.deepEqual(result.headers, { "X-Routefinder-Cache": "HIT" });
  assert.deepEqual(result.body, { count: 1, itineraries: cachedItineraries });
});

test("a cache miss can invoke a provider without real network traffic", async () => {
  let providerCalls = 0;
  const provider: FlightProvider = {
    name: "test-searchapi-provider",
    async searchOneWay() {
      providerCalls += 1;
      return [];
    },
  };

  const result = await runSearchRequest(searchRequest(searchInput()), {
    cache: null,
    provider,
    async planTrip(request, suppliedProvider) {
      await suppliedProvider.searchOneWay({
        origin: request.origin,
        destination: "BKK",
        departureWindow: request.departureWindow,
        adults: request.adults ?? 1,
      });
      return [];
    },
  });

  assert.equal(result.status, 200);
  assert.equal(providerCalls, 1);
});

test("normal public search never requests booking options", async () => {
  let bookingOptionsCalls = 0;
  const provider: FlightProvider & { getBookingOptions(): Promise<never> } = {
    name: "test-provider",
    async searchOneWay() {
      return [];
    },
    async getBookingOptions() {
      bookingOptionsCalls += 1;
      throw new Error("Booking options must not be loaded by /api/search.");
    },
  };

  const result = await runSearchRequest(searchRequest(searchInput()), {
    cache: null,
    provider,
    async planTrip(request, suppliedProvider) {
      await suppliedProvider.searchOneWay({
        origin: request.origin,
        destination: request.destination,
        departureWindow: request.departureWindow,
        adults: request.adults ?? 1,
      });
      return [];
    },
  });

  assert.equal(result.status, 200);
  assert.equal(bookingOptionsCalls, 0);
});

test("request validation and provider failures remain safe for public callers", async () => {
  const invalidResult = await runSearchRequest(
    searchRequest(searchInput({ origin: "NOT_AN_AIRPORT" })),
    { cache: null }
  );
  assert.deepEqual(invalidResult, {
    status: 400,
    body: { error: "Select an airport." },
  });

  const secret = "searchapi_private_do_not_disclose";
  const failedResult = await runSearchRequest(searchRequest(searchInput()), {
    cache: null,
    async planTrip() {
      throw new Error(`Authorization: Bearer ${secret}`);
    },
  });

  assert.deepEqual(failedResult, {
    status: 500,
    body: { error: "Flight search is currently unavailable. Please try again." },
  });
  assert.doesNotMatch(JSON.stringify(failedResult), new RegExp(secret));
});
