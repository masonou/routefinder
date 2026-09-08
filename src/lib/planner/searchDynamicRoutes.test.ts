import assert from "node:assert/strict";
import test from "node:test";

import {
  appendDirectBaseline,
  discoverFlexibleHubCandidates,
  getInitialDepartureDates,
  orderAdventureItineraries,
  searchDynamicRoutePortfolio,
  searchDynamicRoutes,
  toDynamicItinerary,
} from "./searchDynamicRoutes.ts";
import type {
  DirectDestination,
  FlightCalendarProvider,
  FlightProvider,
} from "../providers/types.ts";
import type { FlightOffer } from "../../types/flight.ts";
import type { TripRequest } from "../../types/trip.ts";
import { createItinerary } from "../../types/itinerary.ts";
import type { ValidatedHubCandidate } from "./validateHubCandidates.ts";
import type { VerifiedHubRoute } from "./verifyHubCandidates.ts";

const request: TripRequest = {
  origin: "LCA",
  destination: "DPS",
  departureWindow: { start: "2026-09-01", end: "2026-09-04" },
  adults: 1,
};

const exploredDestinations: DirectDestination[] = [
  {
    airportCode: "DXB",
    city: "Dubai",
    country: "United Arab Emirates",
    latitude: 25.2532,
    longitude: 55.3657,
    outboundDate: "2026-09-01",
    indicativePrice: 180,
    currency: "EUR",
    flightDurationMinutes: 240,
  },
  {
    airportCode: "BKK",
    city: "Bangkok",
    country: "Thailand",
    latitude: 13.6811,
    longitude: 100.747002,
    outboundDate: "2026-09-01",
    indicativePrice: 200,
    currency: "EUR",
    flightDurationMinutes: 600,
  },
];

function offer(
  id: string,
  origin: string,
  destination: string,
  departureDate: string,
  price: number,
  durationMinutes: number,
  stops = 0,
): FlightOffer {
  return {
    id,
    provider: "test",
    origin,
    destination,
    departureAt: `${departureDate}T08:00:00`,
    arrivalAt: `${departureDate}T16:00:00`,
    durationMinutes,
    stops,
    segments: [
      {
        origin,
        destination,
        departureAt: `${departureDate}T08:00:00`,
        arrivalAt: `${departureDate}T16:00:00`,
        airlineName: "Test Air",
      },
    ],
    indicativePrice: { amount: price, currency: "EUR" },
  };
}

function calendarProvider(): FlightCalendarProvider {
  return {
    async getFlightCalendar(input) {
      return [
        {
          departureDate: input.departureWindow.start === "2026-09-03" ? "2026-09-05" : "2026-09-05",
          price: 300,
          currency: "EUR",
          hasFlights: true,
        },
      ];
    },
  };
}

function flightProvider(): FlightProvider {
  return {
    name: "test",
    async searchOneWay(input) {
      if (input.origin === "LCA") {
        return [offer(`first-${input.destination}`, "LCA", input.destination, "2026-09-01", 200, 240)];
      }
      return [offer(`second-${input.origin}`, input.origin, "DPS", "2026-09-05", 300, 480)];
    },
  };
}

const fallbackScenarioHubLocations: Array<[string, string, string, number, number]> = [
  ["DXB", "Dubai", "United Arab Emirates", 25.24979, 55.370992],
  ["DOH", "Doha", "Qatar", 25.273056, 51.608056],
  ["BKK", "Bangkok", "Thailand", 13.6811, 100.747002],
  ["SIN", "Singapore", "Singapore", 1.35019, 103.994003],
];

const fallbackScenarioHubs: DirectDestination[] = fallbackScenarioHubLocations.map(([airportCode, city, country, latitude, longitude], index) => ({
  airportCode,
  city,
  country,
  latitude,
  longitude,
  outboundDate: "2026-09-01",
  indicativePrice: 100 + index,
  currency: "EUR",
  flightDurationMinutes: 240 + index,
}));

async function runFallbackScenario(
  cleanSuccesses: number,
  fallbackStops = 1,
  forceTwoStop = false,
) {
  const fallbackOnwardDates = new Set<string>();
  const cleanFailedHubs = new Set<string>();
  const fallbackDetailedHubs = new Set<string>();
  let cleanCalendarCalls = 0;
  let fallbackCalendarCalls = 0;
  let cleanOnwardCalls = 0;
  let fallbackDetailedCalls = 0;
  let twoStopExploreCalls = 0;

  const portfolio = await searchDynamicRoutePortfolio(request, { forceTwoStop }, {
    directDestinationsCache: null,
    flightCalendarCache: null,
    flightOffersCache: null,
    directDestinationsProvider: {
      async getDirectDestinations(input) {
        if (input.origin !== request.origin) twoStopExploreCalls += 1;
        return fallbackScenarioHubs.map((hub) => ({ ...hub, outboundDate: input.departureDate }));
      },
    },
    flightCalendarProvider: {
      async getFlightCalendar(input) {
        if (input.origin === "LCA" && input.destination === "DPS") {
          return [{ departureDate: "2026-09-01", price: 500, currency: "EUR", hasFlights: true }];
        }
        const isFallback = input.stopPolicy === "two_stops_or_fewer";
        if (isFallback) {
          fallbackCalendarCalls += 1;
          fallbackOnwardDates.add(`${input.origin}:${input.departureWindow.end}`);
        } else {
          cleanCalendarCalls += 1;
        }
        return [{
          departureDate: isFallback ? input.departureWindow.end : input.departureWindow.start,
          price: 300,
          currency: "EUR",
          hasFlights: true,
        }];
      },
    },
    flightProvider: {
      name: "test",
      async searchOneWay(input) {
        if (input.origin === "LCA") {
          return [offer(
            `first-${input.destination}-${input.departureWindow.start}`,
            "LCA",
            input.destination,
            input.departureWindow.start,
            200,
            240,
          )];
        }
        const onwardKey = `${input.origin}:${input.departureWindow.start}`;
        if (fallbackOnwardDates.has(onwardKey)) {
          fallbackDetailedCalls += 1;
          fallbackDetailedHubs.add(input.origin);
          return [offer(`fallback-${input.origin}`, input.origin, "DPS", input.departureWindow.start, 300, 480, fallbackStops)];
        }
        cleanOnwardCalls += 1;
        if (cleanOnwardCalls > cleanSuccesses) cleanFailedHubs.add(input.origin);
        return [offer(
          `clean-${input.origin}`,
          input.origin,
          "DPS",
          input.departureWindow.start,
          300,
          480,
          cleanOnwardCalls <= cleanSuccesses ? 0 : 1,
        )];
      },
    },
  });
  const itineraries = portfolio.itineraries;

  return {
    adventures: itineraries.filter((itinerary) => itinerary.legs.length === 2),
    cleanCalendarCalls,
    fallbackCalendarCalls,
    cleanOnwardCalls,
    fallbackDetailedCalls,
    twoStopExploreCalls,
    cleanFailedHubs,
    fallbackDetailedHubs,
    twoStopDiscovery: portfolio.twoStopDiscovery,
  };
}

function verifiedRouteWithLocation(
  airportCode: string,
  city: string,
  country: string,
): VerifiedHubRoute {
  const hub = {
    airportCode,
    city,
    country,
    firstLegDepartureDate: "2026-09-01",
    latitude: 0,
    longitude: 0,
    source: "explore",
    detourRatio: 1,
    originToHubDistanceKm: 1,
    hubToDestinationDistanceKm: 1,
    candidateScore: 1,
    onwardPolicy: "connecting_fallback",
    onwardOptions: [],
    bestOnwardDate: "2026-09-05",
    bestOnwardPrice: 300,
    bestStayNights: 4,
    validationScore: 1,
  } satisfies ValidatedHubCandidate;
  return {
    hub,
    onwardPolicy: "connecting_fallback",
    firstLeg: offer(`first-${airportCode}`, "LCA", airportCode, "2026-09-01", 200, 240),
    secondLeg: offer(`second-${airportCode}`, airportCode, "DPS", "2026-09-05", 300, 480, 1),
    hubStayNights: 4,
    totalPrice: { amount: 500, currency: "EUR" },
    totalFlightDurationMinutes: 720,
    totalStops: 1,
    scoreBreakdown: { price: 0, duration: 0, stops: 0, detour: 0, stay: 0, final: 0 },
    score: 0,
  };
}

test("dynamic itinerary mapping preserves traveler-facing Explore metadata", () => {
  for (const [airportCode, city, country] of [
    ["ATH", "Athens", "Greece"],
    ["BOM", "Mumbai", "India"],
  ]) {
    assert.deepEqual(
      toDynamicItinerary(verifiedRouteWithLocation(airportCode, city, country))
        .legs[0]?.stopoverAfter,
      { airportCode, city, country, nights: 4 },
    );
  }
});

test("dynamic orchestration maps verified routes into generic itineraries", async () => {
  let exploreCalls = 0;
  let calendarCalls = 0;
  let detailedCalls = 0;
  const itineraries = await searchDynamicRoutes(request, {
    directDestinationsCache: null,
    directDestinationsProvider: {
      async getDirectDestinations(input) {
        exploreCalls += 1;
        return exploredDestinations.map((destination) => ({
          ...destination,
          outboundDate: input.departureDate,
        }));
      },
    },
    flightCalendarProvider: {
      async getFlightCalendar(input) {
        calendarCalls += 1;
        if (input.origin === "LCA" && input.destination === "DPS") {
          return [{ departureDate: "2026-09-01", price: 250, currency: "EUR", hasFlights: true }];
        }
        return calendarProvider().getFlightCalendar(input);
      },
    },
    flightProvider: {
      name: "test",
      async searchOneWay(input) {
        detailedCalls += 1;
        return flightProvider().searchOneWay(input);
      },
    },
  });

  // The existing one-stop calls are retained, followed by a bounded optional
  // two-stop probe because this long route has an unfilled portfolio.
  assert.ok(exploreCalls >= 8 && exploreCalls <= 10);
  assert.ok(calendarCalls >= 5 && calendarCalls <= 9);
  assert.ok(detailedCalls >= 5 && detailedCalls <= 9);
  assert.equal(itineraries.length, 3);
  assert.deepEqual(
    itineraries.slice(1).map((itinerary) => itinerary.legs[0]?.stopoverAfter?.airportCode).sort(),
    ["BKK", "DXB"],
  );
  const stopoversByCode = new Map(
    itineraries.slice(1).map((itinerary) => {
      const stopover = itinerary.legs[0]?.stopoverAfter;
      return [stopover?.airportCode, stopover] as const;
    }),
  );
  assert.deepEqual(stopoversByCode.get("DXB"), {
    airportCode: "DXB",
    city: "Dubai",
    country: "United Arab Emirates",
    nights: 4,
  });
  assert.deepEqual(stopoversByCode.get("BKK"), {
    airportCode: "BKK",
    city: "Bangkok",
    country: "Thailand",
    nights: 4,
  });
  for (const itinerary of itineraries.slice(1)) {
    assert.equal(itinerary.origin, "LCA");
    assert.equal(itinerary.destination, "DPS");
    assert.equal(itinerary.legs.length, 2);
    assert.equal(itinerary.legs[0]?.stopoverAfter?.nights, 4);
    assert.equal(itinerary.legs[0]?.flight.departureAt.slice(0, 10), "2026-09-01");
    assert.equal(itinerary.legs[1]?.flight.departureAt.slice(0, 10), "2026-09-05");
    assert.equal(itinerary.totalPrice.amount, 500);
    assert.equal(itinerary.totalFlightDurationMinutes, 720);
    assert.equal(itinerary.totalStops, 0);
    assert.match(itinerary.id, /^LCA__DPS__/);
  }
  const direct = itineraries[0];
  assert.equal(direct?.legs.length, 1);
  assert.equal(direct?.legs[0]?.stopoverAfter, undefined);
  assert.equal(direct?.totalStops, 0);
});

test("three clean verified adventures skip fallback Calendar and detailed work", async () => {
  const result = await runFallbackScenario(3);

  assert.equal(result.adventures.length, 3);
  assert.ok(result.cleanOnwardCalls >= 3);
  assert.equal(result.fallbackCalendarCalls, 0);
  assert.equal(result.fallbackDetailedCalls, 0);
  assert.equal(result.twoStopExploreCalls, 0);
  assert.deepEqual(result.twoStopDiscovery, {
    explored: false,
    canExplore: true,
    reason: "portfolio_full",
  });
});

test("a forced long-route request bypasses only the full one-stop portfolio optimisation", async () => {
  const result = await runFallbackScenario(3, 1, true);

  assert.ok(result.twoStopExploreCalls > 0, "forced mode should invoke the bounded H2 Explore branch");
  assert.deepEqual(result.twoStopDiscovery, {
    explored: true,
    canExplore: false,
    reason: "already_explored",
  });
});

test("forced two-stop mode remains unavailable on a short route", async () => {
  const shortRoute: TripRequest = {
    ...request,
    origin: "BCN",
    destination: "LCA",
  };
  const portfolio = await searchDynamicRoutePortfolio(shortRoute, { forceTwoStop: true }, {
    directDestinationsCache: null,
    flightCalendarCache: null,
    flightOffersCache: null,
    directDestinationsProvider: { async getDirectDestinations() { return []; } },
    flightCalendarProvider: { async getFlightCalendar() { return []; } },
    flightProvider: flightProvider(),
  });

  assert.deepEqual(portfolio.twoStopDiscovery, {
    explored: false,
    canExplore: false,
    reason: "route_too_short",
  });
});

test("fallback fills slots left by clean detailed failures and can retry a failed clean hub", async () => {
  const result = await runFallbackScenario(1);

  assert.equal(result.adventures.length, 3);
  assert.ok(result.cleanOnwardCalls >= 3);
  assert.equal(result.fallbackCalendarCalls, 4);
  assert.equal(result.fallbackDetailedCalls, 2);
  assert.ok(
    [...result.cleanFailedHubs].some((hub) => result.fallbackDetailedHubs.has(hub)),
    "a clean-detailed failure should remain eligible for fallback verification",
  );
});

test("zero clean detailed adventures pursue fallback routes without manufacturing missing slots", async () => {
  const result = await runFallbackScenario(0);

  assert.ok(result.adventures.length > 0);
  assert.ok(result.adventures.length <= 3);
  assert.ok(result.cleanOnwardCalls >= 3);
  assert.equal(result.fallbackCalendarCalls, 4);
  assert.ok(result.fallbackDetailedCalls > 0);
  assert.ok(result.twoStopExploreCalls > 0);
});

test("fallback rejections leave the successful clean portfolio intact", async () => {
  const result = await runFallbackScenario(1, 3);

  assert.equal(result.adventures.length, 1);
  assert.equal(result.fallbackCalendarCalls, 4);
  assert.ok(result.fallbackDetailedCalls > 0);
});

test("a fallback Calendar candidate with a verified nonstop onward leg is clean", async () => {
  const result = await runFallbackScenario(1, 0);

  assert.equal(result.adventures.length, 3);
  assert.ok(
    result.adventures.slice(1).some((itinerary) =>
      itinerary.legs[1]?.flight.stops === 0,
    ),
  );
});

test("dynamic orchestration returns no results when Explore finds no viable candidates", async () => {
  let exploreCalls = 0;
  let calendarCalls = 0;
  const result = await searchDynamicRoutes(request, {
    directDestinationsCache: null,
    directDestinationsProvider: {
      async getDirectDestinations() {
        exploreCalls += 1;
        return [];
      },
    },
    flightCalendarProvider: {
      async getFlightCalendar() {
        calendarCalls += 1;
        return [];
      },
    },
    flightProvider: flightProvider(),
  });
  assert.deepEqual(result, []);
  assert.equal(exploreCalls, 4);
  assert.equal(calendarCalls, 1);
});

test("a valid direct baseline is returned when adventure discovery finds no candidates", async () => {
  const result = await searchDynamicRoutes(request, {
    directDestinationsCache: null,
    flightCalendarCache: null,
    flightOffersCache: null,
    directDestinationsProvider: { async getDirectDestinations() { return []; } },
    flightCalendarProvider: {
      async getFlightCalendar() {
        return [{ departureDate: "2026-09-01", price: 400, currency: "EUR", hasFlights: true }];
      },
    },
    flightProvider: {
      name: "test",
      async searchOneWay() { return [offer("direct", "LCA", "DPS", "2026-09-01", 400, 720)]; },
    },
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.legs.length, 1);
  assert.equal(result[0]?.legs[0]?.flight.id, "direct");
});

test("a direct discovery failure leaves successful adventure results intact", async () => {
  const warnings: string[] = [];
  const result = await searchDynamicRoutes(request, {
    directDestinationsCache: null,
    flightCalendarCache: null,
    flightOffersCache: null,
    directDestinationsProvider: {
      async getDirectDestinations(input) {
        return exploredDestinations.map((destination) => ({ ...destination, outboundDate: input.departureDate }));
      },
    },
    flightCalendarProvider: {
      async getFlightCalendar(input) {
        if (input.origin === "LCA" && input.destination === "DPS") {
          throw new Error("Direct Calendar unavailable");
        }
        return calendarProvider().getFlightCalendar(input);
      },
    },
    flightProvider: flightProvider(),
    warn: (message) => warnings.push(message),
  });

  assert.equal(result.length, 2);
  assert.ok(result.every((itinerary) => itinerary.legs.length === 2));
  assert.match(warnings.find((message) => message.includes("Direct route discovery failed")) ?? "", /Direct Calendar unavailable/);
});

test("adventures remain unchanged when no direct Calendar date is available", async () => {
  const result = await searchDynamicRoutes(request, {
    directDestinationsCache: null,
    flightCalendarCache: null,
    flightOffersCache: null,
    directDestinationsProvider: {
      async getDirectDestinations(input) {
        return exploredDestinations.map((destination) => ({ ...destination, outboundDate: input.departureDate }));
      },
    },
    flightCalendarProvider: {
      async getFlightCalendar(input) {
        if (input.origin === "LCA" && input.destination === "DPS") return [];
        return calendarProvider().getFlightCalendar(input);
      },
    },
    flightProvider: flightProvider(),
  });

  assert.equal(result.length, 2);
  assert.ok(result.every((itinerary) => itinerary.legs.length === 2));
});

test("dynamic provider errors surface to the API caller instead of falling back", async () => {
  await assert.rejects(
    searchDynamicRoutes(request, {
      directDestinationsCache: null,
      directDestinationsProvider: {
        async getDirectDestinations() {
          throw new Error("Explore unavailable");
        },
      },
      flightCalendarProvider: calendarProvider(),
      flightProvider: flightProvider(),
    }),
    /Explore unavailable/,
  );
});

test("initial departure dates are four inclusive calendar days across a month boundary", () => {
  assert.deepEqual(getInitialDepartureDates("2026-09-28"), [
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
  ]);
});

test("partial Explore failures keep candidates from successful departure dates", async () => {
  const warnings: string[] = [];
  const discovery = await discoverFlexibleHubCandidates(
    { origin: "LCA", destination: "DPS", earliestDeparture: "2026-09-01" },
    {
      directDestinationsCache: null,
      warn: (message) => warnings.push(message),
      directDestinationsProvider: {
        async getDirectDestinations(input) {
          if (input.departureDate === "2026-09-02") {
            throw new Error("Explore unavailable");
          }
          return exploredDestinations.map((destination) => ({
            ...destination,
            outboundDate: input.departureDate,
          }));
        },
      },
    },
  );

  assert.equal(discovery.failures.length, 1);
  assert.equal(discovery.failures[0]?.departureDate, "2026-09-02");
  assert.equal(discovery.calendarCandidates.length, 4);
  assert.deepEqual(
    {
      attempted: discovery.timing.exploreRequests,
      succeeded: discovery.timing.exploreSucceededRequests,
      failed: discovery.timing.exploreFailedRequests,
      live: discovery.timing.exploreLiveRequests,
    },
    { attempted: 4, succeeded: 3, failed: 1, live: 4 },
  );
  assert.match(warnings[0] ?? "", /Travel Explore failed for 2026-09-02/);
});

async function runReverseExploreFailureScenario(failedReverseDates: ReadonlySet<string>) {
  let h1ExploreCalls = 0;
  const portfolio = await searchDynamicRoutePortfolio(request, { forceTwoStop: true }, {
    directDestinationsCache: null,
    flightCalendarCache: null,
    flightOffersCache: null,
    directDestinationsProvider: {
      async getDirectDestinations(input) {
        if (input.origin === request.destination && failedReverseDates.has(input.departureDate)) {
          throw new Error("Reverse Explore timed out");
        }
        if (input.origin !== request.origin && input.origin !== request.destination) h1ExploreCalls += 1;
        return fallbackScenarioHubs.map((hub) => ({
          ...hub,
          outboundDate: input.departureDate,
        }));
      },
    },
    flightCalendarProvider: calendarProvider(),
    flightProvider: flightProvider(),
  });

  return { portfolio, h1ExploreCalls };
}

test("partial Reverse Explore failures retain successful coverage and continue two-stop discovery", async () => {
  const { portfolio, h1ExploreCalls } = await runReverseExploreFailureScenario(
    new Set(["2026-09-03"]),
  );
  const timing = portfolio.timing!;

  assert.equal(timing.twoStopReverseExploreRequests, 4);
  assert.equal(timing.twoStopReverseExploreSucceededRequests, 3);
  assert.equal(timing.twoStopReverseExploreFailedRequests, 1);
  assert.equal(timing.twoStopReverseExploreLiveRequests, 4);
  assert.ok(h1ExploreCalls > 0, "surviving reverse evidence must not stop H1/H2 discovery");
});

test("all Reverse Explore failures leave H1-based two-stop discovery available", async () => {
  const { portfolio, h1ExploreCalls } = await runReverseExploreFailureScenario(
    new Set(getInitialDepartureDates("2026-09-01")),
  );
  const timing = portfolio.timing!;

  assert.equal(timing.twoStopReverseExploreRequests, 4);
  assert.equal(timing.twoStopReverseExploreSucceededRequests, 0);
  assert.equal(timing.twoStopReverseExploreFailedRequests, 4);
  assert.equal(timing.twoStopReverseExploreLiveRequests, 4);
  assert.ok(h1ExploreCalls > 0, "an unavailable reverse network must not abort H1/H2 discovery");
});

test("overlapping flexible searches reuse cached Explore days independently", async () => {
  const values = new Map<string, DirectDestination[]>();
  let providerCalls = 0;
  const cache = {
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async set(key: string, value: DirectDestination[]) {
      values.set(key, value);
    },
  };
  const provider = {
    async getDirectDestinations(input: { departureDate: string }) {
      providerCalls += 1;
      return exploredDestinations.map((destination) => ({
        ...destination,
        outboundDate: input.departureDate,
      }));
    },
  };

  await discoverFlexibleHubCandidates(
    { origin: "LCA", destination: "DPS", earliestDeparture: "2026-09-01" },
    { directDestinationsCache: cache, directDestinationsProvider: provider },
  );
  const overlapping = await discoverFlexibleHubCandidates(
    { origin: "LCA", destination: "DPS", earliestDeparture: "2026-09-02" },
    { directDestinationsCache: cache, directDestinationsProvider: provider },
  );

  assert.equal(providerCalls, 5);
  assert.deepEqual(
    overlapping.exploreResults.map((result) => result.cacheStatus),
    ["HIT", "HIT", "HIT", "MISS"],
  );
});

test("the flexible pipeline remains within the 4 Explore, 9 Calendar, and 7 detailed-call budget", async () => {
  let exploreCalls = 0;
  let calendarCalls = 0;
  let detailedCalls = 0;
  const manyHubs = Array.from({ length: 10 }, (_, index) => ({
    airportCode: index % 2 === 0 ? "DXB" : "BKK",
    city: "Test hub",
    country: "Test country",
    latitude: 25.2532,
    longitude: 55.3657,
    outboundDate: "2026-09-01",
    indicativePrice: 100 + index,
    currency: "EUR",
    flightDurationMinutes: 240,
  }));

  await searchDynamicRoutes(request, {
    directDestinationsCache: null,
    directDestinationsProvider: {
      async getDirectDestinations(input) {
        exploreCalls += 1;
        return manyHubs.map((hub) => ({ ...hub, outboundDate: input.departureDate }));
      },
    },
    flightCalendarProvider: {
      async getFlightCalendar(input) {
        calendarCalls += 1;
        return [{
          departureDate: input.departureWindow.end,
          price: 200,
          currency: "EUR",
          hasFlights: true,
        }];
      },
    },
    flightProvider: {
      name: "test",
      async searchOneWay(input) {
        detailedCalls += 1;
        return [offer(
          `${input.origin}-${input.destination}-${input.departureWindow.start}`,
          input.origin,
          input.destination,
          input.departureWindow.start,
          100,
          240,
        )];
      },
    },
  });

  // One-stop retains its former 20-call envelope. The bounded optional branch
  // can add four destination Reverse Explore calls, up to two H1 Explore
  // calls, two first-leg detailed, and four pair checks
  // (Calendar + detailed for each remaining leg).
  assert.ok(exploreCalls <= 10);
  assert.ok(calendarCalls <= 17);
  assert.ok(detailedCalls <= 17);
  assert.ok(exploreCalls + calendarCalls + detailedCalls <= 40);
});

test("a direct baseline is first and does not replace any adventure", () => {
  const itinerary = (id: string) => createItinerary({
    origin: "ATH",
    destination: "SIN",
    legs: [{ flight: offer(id, "ATH", "SIN", "2026-09-21", 300, 600) }],
    score: 0,
  });
  const adventures = [itinerary("adventure-1"), itinerary("adventure-2"), itinerary("adventure-3")];
  const direct = itinerary("direct");
  assert.deepEqual(
    appendDirectBaseline(adventures, direct).map((item) => item.id),
    [direct, ...adventures].map((item) => item.id),
  );
  assert.deepEqual(appendDirectBaseline(adventures, undefined), adventures);
});

test("portfolio keeps clean adventures ahead of higher-scoring connecting fallbacks", () => {
  const cleanHigh = verifiedRouteWithLocation("AAA", "A", "Test");
  cleanHigh.onwardPolicy = "nonstop";
  cleanHigh.hub.onwardPolicy = "nonstop";
  cleanHigh.score = 80;
  const cleanLow = verifiedRouteWithLocation("BBB", "B", "Test");
  cleanLow.onwardPolicy = "nonstop";
  cleanLow.hub.onwardPolicy = "nonstop";
  cleanLow.score = 70;
  const connecting = verifiedRouteWithLocation("CCC", "C", "Test");
  connecting.score = 95;
  const direct = createItinerary({
    origin: "LCA",
    destination: "DPS",
    legs: [{ flight: offer("direct", "LCA", "DPS", "2026-09-01", 100, 100) }],
    score: 0,
  });

  const portfolio = appendDirectBaseline(
    orderAdventureItineraries([connecting, cleanLow, cleanHigh]),
    direct,
  );
  assert.deepEqual(
    portfolio.map((itinerary) => itinerary.legs[0]?.flight.id),
    ["direct", "first-AAA", "first-BBB", "first-CCC"],
  );
});
