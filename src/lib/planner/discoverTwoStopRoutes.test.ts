import assert from "node:assert/strict";
import test from "node:test";

import type { FlightOffer } from "../../types/flight.ts";
import type { ValidatedHubCandidate } from "./validateHubCandidates.ts";
import {
  discoverTwoStopRoutes,
  buildRoundRobinPairSchedule,
  observedConnectionsByH1,
  rankTwoStopH2Candidates,
  selectHybridTwoStopH1Candidates,
  shouldExploreTwoStopovers,
} from "./discoverTwoStopRoutes.ts";

function offer(origin: string, destination: string, date: string, price = 100, stops = 0): FlightOffer {
  return {
    id: `${origin}-${destination}-${date}-${stops}`,
    provider: "test",
    origin,
    destination,
    departureAt: `${date}T08:00:00`,
    arrivalAt: `${date}T16:00:00`,
    durationMinutes: 480,
    stops,
    segments: [{ origin, destination, departureAt: `${date}T08:00:00`, arrivalAt: `${date}T16:00:00`, airlineName: "Test Air" }],
    indicativePrice: { amount: price, currency: "EUR" },
  };
}

const bangkok: ValidatedHubCandidate = {
  airportCode: "BKK", city: "Bangkok", country: "Thailand",
  firstLegDepartureDate: "2026-09-01", latitude: 13.6811, longitude: 100.747002,
  source: "explore", detourRatio: 1.2, originToHubDistanceKm: 1, hubToDestinationDistanceKm: 1,
  candidateScore: 10, onwardPolicy: "nonstop", onwardOptions: [], bestOnwardDate: "2026-09-05",
  bestOnwardPrice: 200, bestStayNights: 4, validationScore: 10,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

const twoH1s = [
  { ...bangkok, airportCode: "BKK", role: "independent-primary" as const },
  { ...bangkok, airportCode: "HKG", role: "independent-secondary" as const },
];

const twoStopExploreDestinations = [
  { airportCode: "IST", city: "Istanbul", country: "Türkiye", latitude: 41.2753, longitude: 28.7519, outboundDate: "2026-09-05" },
  { airportCode: "DOH", city: "Doha", country: "Qatar", latitude: 25.273056, longitude: 51.608056, outboundDate: "2026-09-05" },
];

function twoH1Dependencies(onMiddleCalendar?: (origin: string) => Promise<void> | void) {
  return {
    directDestinationsCache: null,
    flightCalendarCache: null,
    flightOffersCache: null,
    directDestinationsProvider: {
      async getDirectDestinations() { return twoStopExploreDestinations; },
    },
    flightCalendarProvider: {
      async getFlightCalendar(input: { origin: string }) {
        if (input.origin === "BKK" || input.origin === "HKG") {
          await onMiddleCalendar?.(input.origin);
          return [{ departureDate: "2026-09-04", price: 100, currency: "EUR", hasFlights: true }];
        }
        return [{ departureDate: "2026-09-07", price: 100, currency: "EUR", hasFlights: true }];
      },
    },
    flightProvider: {
      name: "test",
      async searchOneWay(input: { origin: string; destination: string; departureWindow: { start: string } }) {
        if (input.origin === "BNE") return [offer("BNE", input.destination, "2026-09-01")];
        if (input.origin === "BKK" || input.origin === "HKG") return [offer(input.origin, input.destination, "2026-09-04")];
        return [offer(input.origin, "LCA", "2026-09-07")];
      },
    },
  };
}

test("two-stop eligibility is limited to long routes with portfolio space", () => {
  assert.deepEqual(
    shouldExploreTwoStopovers({ directDistanceKm: 3_000, cleanOneStopAdventureCount: 0 }),
    { eligible: false, targetResults: 0, reason: "short_distance" },
  );
  assert.deepEqual(
    shouldExploreTwoStopovers({ directDistanceKm: 10_000, cleanOneStopAdventureCount: 1 }),
    { eligible: true, targetResults: 3, reason: "eligible" },
  );
  assert.deepEqual(
    shouldExploreTwoStopovers({ directDistanceKm: 10_000, cleanOneStopAdventureCount: 3 }),
    { eligible: false, targetResults: 0, reason: "portfolio_full" },
  );
});

test("hybrid H1 selection keeps an independent gateway and a distinct proven one-stop", () => {
  const forward = [
    { ...bangkok, airportCode: "HKG", candidateScore: 300 },
    { ...bangkok, airportCode: "BKK", candidateScore: 200 },
    { ...bangkok, airportCode: "SIN", candidateScore: 100 },
  ];
  const h1s = selectHybridTwoStopH1Candidates({
    forwardCandidates: forward,
    provenCleanRoutes: [{ hub: forward[1]! }, { hub: forward[2]! }],
  });
  assert.deepEqual(h1s.map((candidate) => [candidate.airportCode, candidate.role]), [
    ["HKG", "independent-primary"], ["BKK", "proven-one-stop"],
  ]);
});

test("hybrid H1 selection falls back to two independent candidates when no one-stop is proven", () => {
  const forward = [
    { ...bangkok, airportCode: "DXB", candidateScore: 300 },
    { ...bangkok, airportCode: "FCO", candidateScore: 200 },
  ];
  const h1s = selectHybridTwoStopH1Candidates({ forwardCandidates: forward, provenCleanRoutes: [] });
  assert.deepEqual(h1s.map((candidate) => [candidate.airportCode, candidate.role]), [
    ["DXB", "independent-primary"], ["FCO", "independent-secondary"],
  ]);
});

test("pair attempts use round-robin allocation with spillover", () => {
  const h1a = { ...bangkok, airportCode: "HKG", role: "independent-primary" as const };
  const h1b = { ...bangkok, airportCode: "BKK", role: "proven-one-stop" as const };
  const candidate = (airportCode: string) => ({
    airportCode, city: airportCode, country: "Test", source: "explore" as const,
    fromH1Explore: true, reverseNetworkMatch: false, observedConnection: false,
    combinedPathDetourRatio: 1.2, candidateScore: 100,
  });
  assert.deepEqual(
    buildRoundRobinPairSchedule([
      { h1: h1a, candidates: [candidate("A1"), candidate("A2"), candidate("A3")] },
      { h1: h1b, candidates: [candidate("B1"), candidate("B2"), candidate("B3")] },
    ]).map((entry) => `${entry.h1.airportCode}:${entry.h2.airportCode}`),
    ["HKG:A1", "BKK:B1", "HKG:A2", "BKK:B2"],
  );
  assert.deepEqual(
    buildRoundRobinPairSchedule([
      { h1: h1a, candidates: [candidate("A1"), candidate("A2"), candidate("A3")] },
      { h1: h1b, candidates: [candidate("B1")] },
    ]).map((entry) => `${entry.h1.airportCode}:${entry.h2.airportCode}`),
    ["HKG:A1", "BKK:B1", "HKG:A2", "HKG:A3"],
  );
});

test("dispatches both selected H1 Explore requests before either response is awaited", async () => {
  const h1s = [
    { ...bangkok, airportCode: "BKK", role: "independent-primary" as const },
    { ...bangkok, airportCode: "HKG", role: "independent-secondary" as const },
  ];
  const explored: string[] = [];
  let releaseExplores: (() => void) | undefined;
  const bothExploresStarted = new Promise<void>((resolve) => {
    releaseExplores = resolve;
  });
  const search = discoverTwoStopRoutes(
    { origin: "BNE", destination: "LCA", adults: 1, h1Candidates: h1s, observedConnections: new Map(), targetResults: 3 },
    {
      directDestinationsCache: null, flightCalendarCache: null, flightOffersCache: null,
      directDestinationsProvider: { async getDirectDestinations({ origin }) {
        explored.push(origin);
        if (explored.length === 2) releaseExplores?.();
        await bothExploresStarted;
        return [];
      } },
      flightCalendarProvider: { async getFlightCalendar() { return []; } },
      flightProvider: { name: "test", async searchOneWay(input) { return [offer(input.origin, input.destination, input.departureWindow.start)]; } },
    },
  );
  await bothExploresStarted;
  assert.deepEqual(new Set(explored), new Set(["BKK", "HKG"]));
  await search;
});

test("H1 networks begin while an independently-started reverse network is still pending", async () => {
  const reverse = deferred<ReadonlySet<string>>();
  const explored: string[] = [];
  const bothExploresStarted = deferred<void>();
  const search = discoverTwoStopRoutes(
    {
      origin: "BNE", destination: "LCA", adults: 1, h1Candidates: twoH1s,
      observedConnections: new Map(), reverseDestinationNetwork: reverse.promise, targetResults: 3,
    },
    {
      ...twoH1Dependencies(),
      directDestinationsProvider: {
        async getDirectDestinations({ origin }: { origin: string }) {
          explored.push(origin);
          if (explored.length === 2) bothExploresStarted.resolve();
          return twoStopExploreDestinations;
        },
      },
    },
  );

  await bothExploresStarted.promise;
  assert.deepEqual(new Set(explored), new Set(["BKK", "HKG"]));
  reverse.resolve(new Set(["IST"]));
  await search;
});

test("the first round-robin pair wave validates both H1 branches concurrently", async () => {
  const started: string[] = [];
  const bothStarted = deferred<void>();
  const release = deferred<void>();
  const search = discoverTwoStopRoutes(
    { origin: "BNE", destination: "LCA", adults: 1, h1Candidates: twoH1s, observedConnections: new Map(), targetResults: 3 },
    twoH1Dependencies(async (origin) => {
      started.push(origin);
      if (started.length === 2) bothStarted.resolve();
      await release.promise;
    }),
  );

  await bothStarted.promise;
  assert.deepEqual(new Set(started), new Set(["BKK", "HKG"]));
  release.resolve();
  const result = await search;
  assert.equal(result.timing.twoStopPairValidationWaves, 2);
});

test("two successful first-wave pairs run A2 but skip B2 once the target is reached", async () => {
  const middleCalls: string[] = [];
  const result = await discoverTwoStopRoutes(
    { origin: "BNE", destination: "LCA", adults: 1, h1Candidates: twoH1s, observedConnections: new Map(), targetResults: 3 },
    twoH1Dependencies((origin) => { middleCalls.push(origin); }),
  );

  assert.equal(result.itineraries.length, 3);
  assert.equal(result.attemptedPairs, 3);
  assert.deepEqual(middleCalls, ["BKK", "HKG", "BKK"]);
  assert.equal(result.timing.twoStopPairValidationWaves, 2);
});

test("one successful first-wave pair dispatches both remaining required pairs together", async () => {
  const middleCalls: string[] = [];
  const secondWaveStarted = deferred<void>();
  const releaseSecondWave = deferred<void>();
  const dependencies = twoH1Dependencies();
  dependencies.flightCalendarProvider = {
    async getFlightCalendar(input: { origin: string }) {
      if (input.origin !== "BKK" && input.origin !== "HKG") {
        return [{ departureDate: "2026-09-07", price: 100, currency: "EUR", hasFlights: true }];
      }
      middleCalls.push(input.origin);
      const callNumberForH1 = middleCalls.filter((origin) => origin === input.origin).length;
      if (input.origin === "HKG" && callNumberForH1 === 1) return [];
      if (middleCalls.length === 4) secondWaveStarted.resolve();
      if (callNumberForH1 === 2) await releaseSecondWave.promise;
      return [{ departureDate: "2026-09-04", price: 100, currency: "EUR", hasFlights: true }];
    },
  };
  const search = discoverTwoStopRoutes(
    { origin: "BNE", destination: "LCA", adults: 1, h1Candidates: twoH1s, observedConnections: new Map(), targetResults: 3 },
    dependencies,
  );

  await secondWaveStarted.promise;
  assert.deepEqual(middleCalls, ["BKK", "HKG", "BKK", "HKG"]);
  releaseSecondWave.resolve();
  const result = await search;
  assert.equal(result.itineraries.length, 3);
  assert.equal(result.attemptedPairs, 4);
  assert.equal(result.timing.twoStopPairValidationWaves, 2);
});

test("H2 discovery combines observed connections with Explore and excludes endpoints", () => {
  const candidates = rankTwoStopH2Candidates({
    origin: "BNE", h1: bangkok, destination: "LCA",
    observedConnections: [{ airportCode: "IST", city: "Istanbul", country: "Türkiye" }],
    exploreDestinations: [
      { airportCode: "IST", city: "Istanbul", country: "Türkiye", latitude: 41.2753, longitude: 28.7519, outboundDate: "2026-09-04", indicativePrice: 180, currency: "EUR", flightDurationMinutes: 600 },
      { airportCode: "LCA", city: "Larnaca", country: "Cyprus", latitude: 34.8751, longitude: 33.6249, outboundDate: "2026-09-04" },
    ],
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.airportCode, "IST");
  assert.equal(candidates[0]?.source, "observed_connection+explore");
  assert.ok((candidates[0]?.combinedPathDetourRatio ?? Infinity) <= 2);

  const evidence = observedConnectionsByH1([{
    airportCode: "BKK", leg: "second", origin: "BKK", destination: "LCA", departureDate: "2026-09-05",
    cacheStatus: "MISS", offers: [{ ...offer("BKK", "LCA", "2026-09-05", 100, 1), segments: [
      { origin: "BKK", destination: "IST", departureAt: "2026-09-05T08:00:00", arrivalAt: "2026-09-05T12:00:00", airlineName: "Test Air" },
      { origin: "IST", destination: "LCA", departureAt: "2026-09-05T14:00:00", arrivalAt: "2026-09-05T16:00:00", airlineName: "Test Air" },
    ] }],
  }]);
  assert.equal(evidence.get("BKK")?.[0]?.airportCode, "IST");
});

test("H2 remains eligible without a reverse-network match but never beyond the geography limit", () => {
  const candidates = rankTwoStopH2Candidates({
    origin: "BNE", h1: bangkok, destination: "LCA", observedConnections: [],
    reverseDestinationNetwork: new Set(),
    exploreDestinations: [{ airportCode: "IST", city: "Istanbul", country: "Türkiye", latitude: 41.2753, longitude: 28.7519, outboundDate: "2026-09-04" }],
  });
  assert.equal(candidates[0]?.reverseNetworkMatch, false);
  assert.equal(candidates[0]?.fromH1Explore, true);
});

test("three verified nonstop legs produce retained generic two-stop itineraries up to the category target", async () => {
  const result = await discoverTwoStopRoutes(
    { origin: "BNE", destination: "LCA", adults: 1, h1Candidates: [bangkok], observedConnections: new Map(), targetResults: 3 },
    {
      directDestinationsCache: null, flightCalendarCache: null, flightOffersCache: null,
      directDestinationsProvider: { async getDirectDestinations() {
        return [
          { airportCode: "IST", city: "Istanbul", country: "Türkiye", latitude: 41.2753, longitude: 28.7519, outboundDate: "2026-09-04", indicativePrice: 180, currency: "EUR", flightDurationMinutes: 600 },
          { airportCode: "DOH", city: "Doha", country: "Qatar", latitude: 25.273056, longitude: 51.608056, outboundDate: "2026-09-04", indicativePrice: 190, currency: "EUR", flightDurationMinutes: 420 },
          { airportCode: "KUL", city: "Kuala Lumpur", country: "Malaysia", latitude: 2.7456, longitude: 101.7099, outboundDate: "2026-09-04", indicativePrice: 200, currency: "EUR", flightDurationMinutes: 150 },
        ];
      } },
      flightCalendarProvider: { async getFlightCalendar(input) {
        return [{ departureDate: input.departureWindow.start === "2026-09-03" ? "2026-09-04" : "2026-09-07", price: 100, currency: "EUR", hasFlights: true }];
      } },
      flightProvider: { name: "test", async searchOneWay(input) {
        if (input.origin === "BNE") return [offer("BNE", "BKK", "2026-09-01")];
        if (input.origin === "BKK") return [offer("BKK", input.destination, "2026-09-04")];
        return [offer(input.origin, "LCA", "2026-09-07")];
      } },
    },
  );
  assert.equal(result.itineraries.length, 3);
  const itinerary = result.itineraries[0];
  assert.equal(itinerary?.legs.length, 3);
  assert.deepEqual(itinerary?.legs.map((leg) => leg.stopoverAfter?.nights), [2, 2, undefined]);
  assert.equal(itinerary?.totalStops, 0);
  assert.equal(itinerary?.totalPrice.amount, 300);
  assert.equal(new Set(result.itineraries.map((entry) => entry.legs[1]?.flight.destination)).size, 3);
});

test("technical branch failures remain visible to an explicit caller without changing route selection", async () => {
  const result = await discoverTwoStopRoutes(
    { origin: "BNE", destination: "LCA", adults: 1, h1Candidates: [bangkok], observedConnections: new Map(), targetResults: 3 },
    {
      directDestinationsCache: null,
      flightCalendarCache: null,
      flightOffersCache: null,
      directDestinationsProvider: {
        async getDirectDestinations() { throw new Error("Explore temporarily unavailable"); },
      },
      flightCalendarProvider: { async getFlightCalendar() { return []; } },
      flightProvider: {
        name: "test",
        async searchOneWay() { return [offer("BNE", "BKK", "2026-09-01")]; },
      },
      warn: () => {},
    },
  );

  assert.equal(result.itineraries.length, 0);
  assert.equal(result.technicalFailureCount, 1);
});
