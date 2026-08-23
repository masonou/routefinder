import assert from "node:assert/strict";
import test from "node:test";

import { searchDynamicRoutes } from "./searchDynamicRoutes.ts";
import type {
  DirectDestination,
  FlightCalendarProvider,
  FlightProvider,
} from "../providers/types.ts";
import type { FlightOffer } from "../../types/flight.ts";
import type { TripRequest } from "../../types/trip.ts";

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

test("dynamic orchestration maps verified routes into existing itineraries and keeps booking references", async () => {
  let exploreCalls = 0;
  let calendarCalls = 0;
  let detailedCalls = 0;
  const itineraries = await searchDynamicRoutes(request, {
    directDestinationsCache: null,
    directDestinationsProvider: {
      async getDirectDestinations(input) {
        exploreCalls += 1;
        assert.equal(input.departureDate, "2026-09-01");
        return exploredDestinations;
      },
    },
    flightCalendarProvider: {
      async getFlightCalendar(input) {
        calendarCalls += 1;
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

  assert.equal(exploreCalls, 1);
  assert.equal(calendarCalls, 2);
  assert.equal(detailedCalls, 4);
  assert.deepEqual(itineraries.map((itinerary) => itinerary.hub).sort(), ["BKK", "DXB"]);
  for (const itinerary of itineraries) {
    assert.equal(itinerary.origin, "LCA");
    assert.equal(itinerary.destination, "DPS");
    assert.equal(itinerary.hubStayNights, 4);
    assert.equal(itinerary.totalPrice.amount, 500);
    assert.equal(itinerary.totalFlightDurationMinutes, 720);
    assert.equal(itinerary.totalStops, 1);
    assert.equal(itinerary.id, `${itinerary.firstLeg.id}__${itinerary.secondLeg.id}`);
    assert.ok(itinerary.firstLeg.bookingReference);
    assert.ok(itinerary.secondLeg.bookingReference);
    assert.doesNotMatch(itinerary.id, /opaque-/);
  }
});

test("dynamic orchestration returns no results when Explore finds no viable candidates", async () => {
  let calendarCalls = 0;
  const result = await searchDynamicRoutes(request, {
    directDestinationsCache: null,
    directDestinationsProvider: { async getDirectDestinations() { return []; } },
    flightCalendarProvider: {
      async getFlightCalendar() {
        calendarCalls += 1;
        return [];
      },
    },
    flightProvider: flightProvider(),
  });
  assert.deepEqual(result, []);
  assert.equal(calendarCalls, 0);
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
