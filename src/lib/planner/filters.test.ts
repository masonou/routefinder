import test from "node:test";
import assert from "node:assert/strict";

import {
  arrivesByDate,
  calculateHubStayHours,
  calculateHubStayNights,
  isReasonableFlight,
} from "./filters.ts";
import type { FlightOffer } from "../../types/flight";

function createFlightOffer(overrides: Partial<FlightOffer>): FlightOffer {
  return {
    id: "test-offer",
    provider: "test",
    origin: "AAA",
    destination: "BBB",
    departureAt: "2026-09-09T08:00:00",
    arrivalAt: "2026-09-09T12:00:00",
    durationMinutes: 240,
    stops: 0,
    segments: [
      {
        origin: "AAA",
        destination: "BBB",
        departureAt: "2026-09-09T08:00:00",
        arrivalAt: "2026-09-09T12:00:00",
        airlineName: "Test Air",
        airlineCode: "TA",
        flightNumber: "TA100",
      },
    ],
    indicativePrice: {
      amount: 100,
      currency: "EUR",
    },
    ...overrides,
  };
}

test("calculateHubStayNights counts completed 24-hour periods from timestamps", () => {
  const firstLeg = createFlightOffer({
    destination: "BKK",
    arrivalAt: "2026-09-10T10:05:00",
  });
  const secondLeg = createFlightOffer({
    origin: "BKK",
    departureAt: "2026-09-13T09:17:00",
  });

  assert.equal(calculateHubStayNights(firstLeg, secondLeg), 2);
});

test("calculateHubStayNights returns -1 for same-day departure", () => {
  const firstLeg = createFlightOffer({
    destination: "BKK",
    arrivalAt: "2026-09-10T10:05:00",
  });
  const secondLeg = createFlightOffer({
    origin: "BKK",
    departureAt: "2026-09-10T18:00:00",
  });

  assert.equal(calculateHubStayNights(firstLeg, secondLeg), -1);
});

test("calculateHubStayNights returns -1 when departure is before arrival", () => {
  const firstLeg = createFlightOffer({
    destination: "BKK",
    arrivalAt: "2026-09-10T10:05:00",
  });
  const secondLeg = createFlightOffer({
    origin: "BKK",
    departureAt: "2026-09-09T09:17:00",
  });

  assert.equal(calculateHubStayNights(firstLeg, secondLeg), -1);
});

test("calculateHubStayNights returns -1 for malformed timestamps", () => {
  const firstLeg = createFlightOffer({
    destination: "BKK",
    arrivalAt: "not-a-timestamp",
  });
  const secondLeg = createFlightOffer({
    origin: "BKK",
    departureAt: "2026-09-13T09:17:00",
  });

  assert.equal(calculateHubStayNights(firstLeg, secondLeg), -1);
});

test("calculateHubStayNights rounds down elapsed time rather than calendar labels", () => {
  const firstLeg = createFlightOffer({
    destination: "BKK",
    arrivalAt: "2026-09-10T22:30:00",
  });
  const secondLeg = createFlightOffer({
    origin: "BKK",
    departureAt: "2026-09-12T06:00:00",
  });

  assert.equal(calculateHubStayNights(firstLeg, secondLeg), 1);
});

test("stopover duration uses real timestamps, not just the calendar dates", () => {
  const firstLeg = createFlightOffer({ destination: "BKK", arrivalAt: "2026-09-10T23:30:00" });
  const secondLeg = createFlightOffer({ origin: "BKK", departureAt: "2026-09-12T01:00:00" });
  assert.equal(calculateHubStayHours(firstLeg, secondLeg), 25.5);
  assert.equal(calculateHubStayNights(firstLeg, secondLeg), 1);
});

test("destination-local arrival date enforces arrive-by, including overnight flights", () => {
  const flight = createFlightOffer({ arrivalAt: "2026-09-14T00:20:00" });
  assert.equal(arrivesByDate(flight, "2026-09-13"), false);
  assert.equal(arrivesByDate(flight, "2026-09-14"), true);
});

test("accepts valid long-haul offers whose destination-local arrival clock is earlier", () => {
  const cases: Array<Partial<FlightOffer>> = [
    {
      origin: "SYD", destination: "SCL", departureAt: "2026-09-19T11:45:00",
      arrivalAt: "2026-09-19T11:30:00", durationMinutes: 765,
    },
    {
      origin: "AKL", destination: "SCL", departureAt: "2026-09-20T19:10:00",
      arrivalAt: "2026-09-20T15:25:00", durationMinutes: 675,
    },
    {
      origin: "MEL", destination: "SCL", departureAt: "2026-09-20T12:00:00",
      arrivalAt: "2026-09-20T11:35:00", durationMinutes: 755,
    },
  ];

  for (const entry of cases) {
    const flight = createFlightOffer({
      ...entry,
      segments: [{
        origin: entry.origin as string,
        destination: entry.destination as string,
        departureAt: entry.departureAt as string,
        arrivalAt: entry.arrivalAt as string,
        airlineName: "Test Air",
      }],
    });
    assert.equal(isReasonableFlight(flight), true, `${entry.origin} → ${entry.destination}`);
  }
});

test("keeps local timestamp, duration, and structural sanity checks", () => {
  assert.equal(isReasonableFlight(createFlightOffer({})), true);
  assert.equal(isReasonableFlight(createFlightOffer({ durationMinutes: 0 })), false);
  assert.equal(isReasonableFlight(createFlightOffer({ durationMinutes: -1 })), false);
  assert.equal(isReasonableFlight(createFlightOffer({ durationMinutes: 60 * 60 + 1 })), false);
  assert.equal(isReasonableFlight(createFlightOffer({ departureAt: "" })), false);
  assert.equal(isReasonableFlight(createFlightOffer({ arrivalAt: "" })), false);
  assert.equal(isReasonableFlight(createFlightOffer({ departureAt: "not-a-timestamp" })), false);
  assert.equal(isReasonableFlight(createFlightOffer({ arrivalAt: "not-a-timestamp" })), false);
  assert.equal(isReasonableFlight(createFlightOffer({
    segments: [{
      origin: "AAA", destination: "BBB", departureAt: "", arrivalAt: "2026-09-09T12:00:00", airlineName: "Test Air",
    }],
  })), false);
});
