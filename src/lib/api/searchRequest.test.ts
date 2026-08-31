import assert from "node:assert/strict";
import test from "node:test";

import { runSearchRequest } from "./searchRequest.ts";
import type { SearchCache } from "../cache/searchCache.ts";
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

test("public searches use dynamic discovery with the existing D through D+3 window", async () => {
  let receivedRequest: TripRequest | undefined;

  const result = await runSearchRequest(searchRequest(searchInput()), {
    cache: null,
    async searchDynamicRoutes(request) {
      receivedRequest = request;
      return [];
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(receivedRequest?.departureWindow, {
    start: "2099-08-17",
    end: "2099-08-20",
  });
  if (!("headers" in result)) {
    throw new Error("Expected cache headers on a successful result.");
  }
  assert.deepEqual(result.headers, { "X-Routefinder-Cache": "MISS" });
  assert.deepEqual(result.body, { count: 0, itineraries: [] });
});

test("a cache hit returns cached data without invoking dynamic discovery", async () => {
  let searchCalls = 0;
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
    async searchDynamicRoutes() {
      searchCalls += 1;
      return [];
    },
  });

  assert.equal(result.status, 200);
  assert.equal(searchCalls, 0);
  if (!("headers" in result)) {
    throw new Error("Expected cache headers on a successful result.");
  }
  assert.deepEqual(result.headers, { "X-Routefinder-Cache": "HIT" });
  assert.deepEqual(result.body, { count: 1, itineraries: cachedItineraries });
});

test("a cache miss invokes dynamic discovery", async () => {
  let searchCalls = 0;
  const result = await runSearchRequest(searchRequest(searchInput()), {
    cache: null,
    async searchDynamicRoutes() {
      searchCalls += 1;
      return [];
    },
  });

  assert.equal(result.status, 200);
  assert.equal(searchCalls, 1);
});

test("dynamic discovery is unconditional", async () => {
  let dynamicCalls = 0;
  const dynamicItinerary = { id: "dynamic" } as Itinerary;

  const result = await runSearchRequest(searchRequest(searchInput()), {
    cache: null,
    async searchDynamicRoutes(request) {
      dynamicCalls += 1;
      assert.equal(request.departureWindow.start, "2099-08-17");
      return [dynamicItinerary];
    },
  });
  assert.equal(result.status, 200);
  assert.equal(dynamicCalls, 1);
  assert.deepEqual(result.body, { count: 1, itineraries: [dynamicItinerary] });
});

test("dynamic no-results and provider failures retain public API behaviour", async () => {
  const noResults = await runSearchRequest(searchRequest(searchInput()), {
    cache: null,
    async searchDynamicRoutes() {
      return [];
    },
  });
  assert.deepEqual(noResults, {
    status: 200,
    body: { count: 0, itineraries: [] },
    headers: { "X-Routefinder-Cache": "MISS" },
  });

  const failure = await runSearchRequest(searchRequest(searchInput()), {
    cache: null,
    async searchDynamicRoutes() {
      throw new Error("provider failed");
    },
  });
  assert.deepEqual(failure, {
    status: 500,
    body: { error: "Flight search is currently unavailable. Please try again." },
  });
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
    async searchDynamicRoutes() {
      throw new Error(`Authorization: Bearer ${secret}`);
    },
  });

  assert.deepEqual(failedResult, {
    status: 500,
    body: { error: "Flight search is currently unavailable. Please try again." },
  });
  assert.doesNotMatch(JSON.stringify(failedResult), new RegExp(secret));
});
