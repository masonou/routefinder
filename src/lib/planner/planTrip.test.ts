import assert from "node:assert/strict";
import test from "node:test";

import { planTrip } from "./planTrip.ts";
import type { FlightOffer } from "../../types/flight.ts";
import type { FlightProvider, FlightSearchInput } from "../providers/types.ts";

function createOffer(
  id: string,
  origin: string,
  destination: string,
  departureAt: string,
  arrivalAt: string
): FlightOffer {
  return {
    id,
    provider: "test",
    origin,
    destination,
    departureAt,
    arrivalAt,
    durationMinutes: 240,
    stops: 0,
    segments: [
      {
        origin,
        destination,
        departureAt,
        arrivalAt,
        airlineName: "Test Air",
        airlineCode: "TA",
        flightNumber: "TA100",
      },
    ],
    indicativePrice: {
      amount: 100,
      currency: "EUR",
    },
  };
}

function createProvider(searches: FlightSearchInput[]): FlightProvider {
  const firstLeg = createOffer(
    "first-leg",
    "BNE",
    "BKK",
    "2026-08-20T08:00:00",
    "2026-08-20T12:00:00"
  );
  const secondLeg = createOffer(
    "second-leg",
    "BKK",
    "LCA",
    "2026-08-26T08:00:00",
    "2026-08-26T12:00:00"
  );

  return {
    name: "test",
    async searchOneWay(input) {
      searches.push(input);
      return input.destination === "BKK" ? [firstLeg] : [secondLeg];
    },
  };
}

test("planner supports a D through D+3 request with no final-arrival deadline", async () => {
  const searches: FlightSearchInput[] = [];
  const itineraries = await planTrip(
    {
      origin: "BNE",
      destination: "LCA",
      departureWindow: { start: "2026-08-17", end: "2026-08-20" },
      adults: 1,
    },
    createProvider(searches)
  );

  assert.equal(itineraries.length, 1);
  assert.equal(itineraries[0]?.legs[0]?.flight.departureAt.slice(0, 10), "2026-08-20");
  assert.equal(itineraries[0]?.legs[0]?.stopoverAfter?.nights, 6);
  assert.equal(itineraries[0]?.legs[0]?.stopoverAfter?.city, "Bangkok");
  assert.equal(itineraries[0]?.legs[0]?.stopoverAfter?.country, "Thailand");
  assert.deepEqual(searches[1]?.departureWindow, {
    start: "2026-08-22",
    end: "2026-08-26",
  });
});

test("planner continues to apply an optional legacy arrival-window cap", async () => {
  const searches: FlightSearchInput[] = [];
  const itineraries = await planTrip(
    {
      origin: "BNE",
      destination: "LCA",
      departureWindow: { start: "2026-08-17", end: "2026-08-20" },
      arrivalWindow: { start: "2026-08-17", end: "2026-08-26" },
      adults: 1,
    },
    createProvider(searches)
  );

  assert.equal(itineraries.length, 1);
  assert.deepEqual(searches[1]?.departureWindow, {
    start: "2026-08-22",
    end: "2026-08-26",
  });
});
