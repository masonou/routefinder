import assert from "node:assert/strict";
import test from "node:test";

import { createDuffelFlightProvider } from "./duffel.ts";
import type { FlightOffer } from "../../types/flight.ts";
import type { FlightSearchInput } from "./types.ts";

function createOffer(id: string, departureAt: string): FlightOffer {
  const arrivalAt = `${departureAt.slice(0, 11)}14:00:00`;

  return {
    id,
    provider: "duffel",
    origin: "BNE",
    destination: "BKK",
    departureAt,
    arrivalAt,
    durationMinutes: 360,
    stops: 0,
    segments: [
      {
        origin: "BNE",
        destination: "BKK",
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

const sampleInput: FlightSearchInput = {
  origin: "BNE",
  destination: "BKK",
  departureWindow: {
    start: "2026-09-09",
    end: "2026-09-11",
  },
  adults: 1,
};

test("duffelFlightProvider searches every date in the window and combines results", async () => {
  const searchedDates: string[] = [];
  const provider = createDuffelFlightProvider({
    async searchExactDate(_input, departureDate) {
      searchedDates.push(departureDate);
      return [createOffer(`offer-${departureDate}`, `${departureDate}T08:00:00`)];
    },
  });

  const offers = await provider.searchOneWay(sampleInput);

  assert.deepEqual(searchedDates, ["2026-09-09", "2026-09-10", "2026-09-11"]);
  assert.deepEqual(
    offers.map((offer) => offer.id),
    ["offer-2026-09-09", "offer-2026-09-10", "offer-2026-09-11"]
  );
});

test("duffelFlightProvider removes duplicate offer IDs across dates", async () => {
  const provider = createDuffelFlightProvider({
    async searchExactDate(_input, departureDate) {
      return [
        createOffer("shared-offer", `${departureDate}T08:00:00`),
        createOffer(`unique-${departureDate}`, `${departureDate}T09:00:00`),
      ];
    },
  });

  const offers = await provider.searchOneWay(sampleInput);

  assert.deepEqual(
    offers.map((offer) => offer.id),
    ["shared-offer", "unique-2026-09-09", "unique-2026-09-10", "unique-2026-09-11"]
  );
});

test("duffelFlightProvider surfaces date-specific errors", async () => {
  const provider = createDuffelFlightProvider({
    async searchExactDate(_input, departureDate) {
      if (departureDate === "2026-09-10") {
        throw new Error("rate limited");
      }

      return [createOffer(`offer-${departureDate}`, `${departureDate}T08:00:00`)];
    },
  });

  await assert.rejects(
    () => provider.searchOneWay(sampleInput),
    /Duffel search failed for BNE → BKK on 2026-09-10: rate limited/
  );
});

test("duffelFlightProvider tests do not require a real Duffel token or API request", async () => {
  const provider = createDuffelFlightProvider({
    async searchExactDate(_input, departureDate) {
      return [createOffer(`offer-${departureDate}`, `${departureDate}T08:00:00`)];
    },
  });

  const offers = await provider.searchOneWay({
    ...sampleInput,
    departureWindow: {
      start: "2026-09-09",
      end: "2026-09-09",
    },
  });

  assert.equal(offers.length, 1);
  assert.equal(offers[0]?.id, "offer-2026-09-09");
});
