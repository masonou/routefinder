import assert from "node:assert/strict";
import test from "node:test";

import { runSearchRequest } from "./searchRequest.ts";
import { createSearchProgressStreamSink } from "./searchStream.ts";
import type { SearchCache } from "../cache/searchCache.ts";
import type { Itinerary } from "../../types/itinerary.ts";
import type { TripRequest } from "../../types/trip.ts";
import { createSearchApiFlightProvider } from "../providers/searchApi.ts";
import { FatalSearchStageError } from "../planner/fatalStageFailure.ts";

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
    arriveBy: "2099-08-22",
    adults: 1,
    ...overrides,
  };
}

test("public searches use dynamic discovery with an exact departure date", async () => {
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
    end: "2099-08-17",
  });
  assert.equal(receivedRequest?.arriveByDate, "2099-08-22");
  if (!("headers" in result)) {
    throw new Error("Expected cache headers on a successful result.");
  }
  assert.deepEqual(result.headers, { "X-Routefinder-Cache": "MISS" });
  assert.deepEqual(result.body, {
    count: 0,
    itineraries: [],
    twoStopDiscovery: { explored: false, canExplore: false, reason: "unavailable" },
    outcome: "no_stopover_within_window",
  });
});

test("a cache hit returns cached data without invoking dynamic discovery", async () => {
  let searchCalls = 0;
  const cachedItineraries = [{} as Itinerary];
  const cache: SearchCache = {
    async get() {
      return {
        count: 1,
        itineraries: cachedItineraries,
        twoStopDiscovery: { explored: false, canExplore: false, reason: "unavailable" },
        outcome: "success",
      };
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
  assert.deepEqual(result.body, {
    count: 1,
    itineraries: cachedItineraries,
    twoStopDiscovery: { explored: false, canExplore: false, reason: "unavailable" },
    outcome: "success",
  });
});

test("debug timing reports a high-level cache hit with no provider work", async () => {
  const prior = process.env.SEARCH_DEBUG_TIMINGS;
  process.env.SEARCH_DEBUG_TIMINGS = "true";
  try {
    const result = await runSearchRequest(searchRequest(searchInput()), {
      cache: {
        async get() {
          return {
            count: 0,
            itineraries: [],
            twoStopDiscovery: { explored: false, canExplore: false, reason: "unavailable" },
            outcome: "no_stopover_within_window",
          };
        },
        async set() {},
      },
      async searchDynamicRoutes() {
        throw new Error("A cache hit must not invoke the planner.");
      },
    });
    assert.equal(result.status, 200);
    if (!("timing" in result.body) || !result.body.timing) throw new Error("Expected debug timing metadata.");
    const timing = result.body.timing as import("../instrumentation/searchTiming.ts").SearchTiming;
    assert.equal(timing.searchCacheHit, true);
    assert.equal(timing.providerLiveRequests, 0);
    assert.equal(timing.providerCacheHits, 0);
  } finally {
    if (prior === undefined) delete process.env.SEARCH_DEBUG_TIMINGS;
    else process.env.SEARCH_DEBUG_TIMINGS = prior;
  }
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

test("client cancellation cannot turn a verified forced two-stop itinerary into a search failure", async () => {
  const sink = createSearchProgressStreamSink({
    get desiredSize() { return 1; },
    enqueue() {},
    close() {},
  });
  sink.cancel();
  const itinerary = { id: "verified-after-cancel" } as Itinerary;
  let plannerCompleted = false;

  const result = await runSearchRequest(
    searchRequest(searchInput({ forceTwoStop: true })),
    {
      cache: null,
      async searchDynamicRoutes(_request, options) {
        options.onItineraryVerified?.(itinerary, "two_stop");
        plannerCompleted = true;
        return {
          count: 1,
          itineraries: [itinerary],
          twoStopDiscovery: { explored: true, canExplore: false, reason: "already_explored" },
          outcome: "success",
        };
      },
    },
    { onProgress: sink.emit },
  );

  assert.equal(plannerCompleted, true);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.itineraries, [itinerary]);
});

test("forced two-stop requests are passed as a bounded planner option", async () => {
  let receivedForceTwoStop: boolean | undefined;
  const result = await runSearchRequest(searchRequest(searchInput({ forceTwoStop: true })), {
    cache: null,
    async searchDynamicRoutes(_request, options) {
      receivedForceTwoStop = options.forceTwoStop;
      return {
        count: 0,
        itineraries: [],
        twoStopDiscovery: { explored: true, canExplore: false, reason: "already_explored" },
        outcome: "no_stopover_within_window",
      };
    },
  });

  assert.equal(result.status, 200);
  assert.equal(receivedForceTwoStop, true);
  if (!("twoStopDiscovery" in result.body)) throw new Error("Expected discovery metadata.");
  assert.deepEqual(result.body.twoStopDiscovery, {
    explored: true,
    canExplore: false,
    reason: "already_explored",
  });
});

test("normal and forced responses do not collide in the high-level cache", async () => {
  const values = new Map<string, import("../cache/searchCache.ts").SearchCacheValue>();
  const cache: SearchCache = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
  };
  let plannerCalls = 0;
  const planner = async (_request: TripRequest, options: { forceTwoStop: boolean }) => {
    plannerCalls += 1;
    return {
      count: 0,
      itineraries: [],
      twoStopDiscovery: options.forceTwoStop
        ? { explored: true as const, canExplore: false as const, reason: "already_explored" as const }
        : { explored: false as const, canExplore: true as const, reason: "portfolio_full" as const },
      outcome: "no_stopover_within_window" as const,
    };
  };

  const normal = await runSearchRequest(searchRequest(searchInput()), { cache, searchDynamicRoutes: planner });
  const forced = await runSearchRequest(
    searchRequest(searchInput({ forceTwoStop: true })),
    { cache, searchDynamicRoutes: planner },
  );

  assert.equal(plannerCalls, 2);
  if (!("twoStopDiscovery" in normal.body) || !("twoStopDiscovery" in forced.body)) {
    throw new Error("Expected discovery metadata.");
  }
  assert.equal(normal.body.twoStopDiscovery.reason, "portfolio_full");
  assert.equal(forced.body.twoStopDiscovery.reason, "already_explored");
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
  assert.deepEqual(result.body, {
    count: 1,
    itineraries: [dynamicItinerary],
    twoStopDiscovery: { explored: false, canExplore: false, reason: "unavailable" },
    outcome: "success",
  });
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
    body: {
      count: 0,
      itineraries: [],
      twoStopDiscovery: { explored: false, canExplore: false, reason: "unavailable" },
      outcome: "no_stopover_within_window",
    },
    headers: { "X-Routefinder-Cache": "MISS" },
  });

  const failure = await runSearchRequest(searchRequest(searchInput()), {
    cache: null,
    createFailureReference: (code) => `${code}-TESTREF`,
    async searchDynamicRoutes() {
      throw new Error("provider failed");
    },
  });
  assert.deepEqual(failure, {
    status: 500,
    body: {
      error: "Flight search is currently unavailable. Please try again.",
      failureCode: "SL-SEARCH-UNKNOWN",
      failureReference: "SL-SEARCH-UNKNOWN-TESTREF",
      failureStage: "unknown",
      retryable: false,
    },
  });
});

test("maps provider failures to stable API references", async () => {
  const providerFailure = (status: number) => {
    const provider = createSearchApiFlightProvider({
      apiKey: "searchapi_test_secret",
      fetch: async () => new Response(JSON.stringify({ error: "failure" }), { status }),
    });
    return provider.searchOneWay({
      origin: "BNE",
      destination: "LCA",
      departureWindow: { start: "2099-08-17", end: "2099-08-17" },
      adults: 1,
    });
  };
  const timeout = new Error("timeout");
  timeout.name = "AbortError";
  const cases: Array<{
    name: string;
    run: () => Promise<unknown>;
    status: number;
    code: string;
    stage: string;
  }> = [
    { name: "timeout", run: async () => { throw timeout; }, status: 504, code: "SL-PROVIDER-TIMEOUT", stage: "provider" },
    { name: "rate limit", run: () => providerFailure(429), status: 429, code: "SL-PROVIDER-RATE-LIMIT", stage: "provider" },
    { name: "unavailable", run: () => providerFailure(503), status: 503, code: "SL-PROVIDER-UNAVAILABLE", stage: "provider" },
    { name: "authentication", run: () => providerFailure(401), status: 500, code: "SL-PROVIDER-AUTH", stage: "provider" },
    {
      name: "invalid provider response",
      run: () => createSearchApiFlightProvider({
        apiKey: "searchapi_test_secret",
        fetch: async () => new Response("not json", { status: 200 }),
      }).searchOneWay({
        origin: "BNE", destination: "LCA",
        departureWindow: { start: "2099-08-17", end: "2099-08-17" }, adults: 1,
      }),
      status: 502,
      code: "SL-PROVIDER-INVALID-RESPONSE",
      stage: "provider",
    },
  ];

  for (const entry of cases) {
    const result = await runSearchRequest(searchRequest(searchInput()), {
      cache: null,
      createFailureReference: (code) => `${code}-TESTREF`,
      async searchDynamicRoutes() {
        await entry.run();
        return [];
      },
    });
    assert.equal(result.status, entry.status, entry.name);
    if (!("failureCode" in result.body)) {
      throw new Error(`Expected structured failure response for ${entry.name}.`);
    }
    assert.equal(result.body.failureCode, entry.code, entry.name);
    assert.equal(result.body.failureReference, `${entry.code}-TESTREF`, entry.name);
    assert.equal(result.body.failureStage, entry.stage, entry.name);
  }
});

test("uses the resolved fatal-stage cause in the public failure code and reference", async () => {
  const result = await runSearchRequest(searchRequest(searchInput()), {
    cache: null,
    createFailureReference: (code) => `${code}-TESTREF`,
    async searchDynamicRoutes() {
      throw new FatalSearchStageError("explore", Array.from({ length: 4 }, () => ({
        message: "SearchAPI authentication failed.",
        status: 401,
        retryable: false,
      })));
    },
  });

  assert.equal(result.status, 500);
  if (!("failureCode" in result.body)) {
    throw new Error("Expected a structured search failure.");
  }
  assert.equal(result.body.failureCode, "SL-PROVIDER-AUTH");
  assert.equal(result.body.failureStage, "explore");
  assert.equal(result.body.failureReference, "SL-PROVIDER-AUTH-TESTREF");
  assert.equal(result.body.retryable, false);
  assert.equal(result.body.providerStatus, 401);
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
    createFailureReference: (code) => `${code}-TESTREF`,
    async searchDynamicRoutes() {
      throw new Error(`Authorization: Bearer ${secret}`);
    },
  });

  assert.deepEqual(failedResult, {
    status: 500,
    body: {
      error: "Flight search is currently unavailable. Please try again.",
      failureCode: "SL-SEARCH-UNKNOWN",
      failureReference: "SL-SEARCH-UNKNOWN-TESTREF",
      failureStage: "unknown",
      retryable: false,
    },
  });
  assert.doesNotMatch(JSON.stringify(failedResult), new RegExp(secret));

  const invalidForceMode = await runSearchRequest(
    searchRequest(searchInput({ forceTwoStop: "yes" })),
    { cache: null },
  );
  assert.deepEqual(invalidForceMode, {
    status: 400,
    body: { error: "forceTwoStop must be a boolean." },
  });
});
