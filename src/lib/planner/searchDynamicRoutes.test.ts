import assert from "node:assert/strict";
import test from "node:test";

import {
  appendDirectBaseline,
  discoverFlexibleHubCandidates,
  getInitialDepartureDates,
  searchDynamicRoutes,
} from "./searchDynamicRoutes.ts";
import type {
  DirectDestination,
  FlightCalendarProvider,
  FlightProvider,
} from "../providers/types.ts";
import type { FlightOffer } from "../../types/flight.ts";
import type { TripRequest } from "../../types/trip.ts";
import { createItinerary } from "../../types/itinerary.ts";

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
    bookingReference: `opaque-${id}`,
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
      return [offer(`second-${input.origin}`, input.origin, "DPS", "2026-09-05", 300, 480, 1)];
    },
  };
}

test("dynamic orchestration maps verified routes into generic itineraries and keeps booking references", async () => {
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

  assert.equal(exploreCalls, 4);
  assert.equal(calendarCalls, 5);
  assert.equal(detailedCalls, 5);
  assert.equal(itineraries.length, 3);
  assert.deepEqual(
    itineraries.slice(0, 2).map((itinerary) => itinerary.legs[0]?.stopoverAfter?.airportCode).sort(),
    ["BKK", "DXB"],
  );
  for (const itinerary of itineraries.slice(0, 2)) {
    assert.equal(itinerary.origin, "LCA");
    assert.equal(itinerary.destination, "DPS");
    assert.equal(itinerary.legs.length, 2);
    assert.equal(itinerary.legs[0]?.stopoverAfter?.nights, 4);
    assert.equal(itinerary.legs[0]?.flight.departureAt.slice(0, 10), "2026-09-01");
    assert.equal(itinerary.legs[1]?.flight.departureAt.slice(0, 10), "2026-09-05");
    assert.equal(itinerary.totalPrice.amount, 500);
    assert.equal(itinerary.totalFlightDurationMinutes, 720);
    assert.equal(itinerary.totalStops, 1);
    assert.match(itinerary.id, /^LCA__DPS__/);
    assert.ok(itinerary.legs[0]?.flight.bookingReference);
    assert.ok(itinerary.legs[1]?.flight.bookingReference);
    assert.doesNotMatch(itinerary.id, /opaque-/);
  }
  const direct = itineraries.at(-1);
  assert.equal(direct?.legs.length, 1);
  assert.equal(direct?.legs[0]?.stopoverAfter, undefined);
  assert.equal(direct?.legs[0]?.flight.bookingReference, "opaque-first-DPS");
  assert.equal(direct?.totalStops, 0);
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
  assert.match(warnings[0] ?? "", /Travel Explore failed for 2026-09-02/);
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

  assert.ok(exploreCalls <= 4);
  assert.ok(calendarCalls <= 9);
  assert.ok(detailedCalls <= 7);
  assert.ok(exploreCalls + calendarCalls + detailedCalls <= 20);
});

test("a direct baseline is appended after three adventures without replacing one", () => {
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
    [...adventures, direct].map((item) => item.id),
  );
  assert.deepEqual(appendDirectBaseline(adventures, undefined), adventures);
});
