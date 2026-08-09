import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateHubStayNights,
  deriveSecondLegDepartureWindow,
  isArrivalWithinWindow,
  isCompatibleConnection,
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

test("calculateHubStayNights counts local calendar nights between arrival and departure dates", () => {
  const firstLeg = createFlightOffer({
    destination: "BKK",
    arrivalAt: "2026-09-10T10:05:00",
  });
  const secondLeg = createFlightOffer({
    origin: "BKK",
    departureAt: "2026-09-13T09:17:00",
  });

  assert.equal(calculateHubStayNights(firstLeg, secondLeg), 3);
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

test("calculateHubStayNights returns 2 for a two-night stay", () => {
  const firstLeg = createFlightOffer({
    destination: "BKK",
    arrivalAt: "2026-09-10T22:30:00",
  });
  const secondLeg = createFlightOffer({
    origin: "BKK",
    departureAt: "2026-09-12T06:00:00",
  });

  assert.equal(calculateHubStayNights(firstLeg, secondLeg), 2);
});

test("deriveSecondLegDepartureWindow caps the end date to the final arrival window end", () => {
  const firstLegOffers = [
    createFlightOffer({
      id: "first-leg-a",
      destination: "BKK",
      arrivalAt: "2026-09-10T10:05:00",
    }),
    createFlightOffer({
      id: "first-leg-b",
      destination: "BKK",
      arrivalAt: "2026-09-12T10:05:00",
    }),
  ];

  assert.deepEqual(
    deriveSecondLegDepartureWindow(firstLegOffers, {
      start: "2026-09-12",
      end: "2026-09-15",
    }),
    {
      start: "2026-09-12",
      end: "2026-09-15",
    }
  );
});

test("deriveSecondLegDepartureWindow has no final-arrival cap when one is not supplied", () => {
  const firstLegOffers = [
    createFlightOffer({
      id: "first-leg-a",
      destination: "BKK",
      arrivalAt: "2026-09-10T10:05:00",
    }),
    createFlightOffer({
      id: "first-leg-b",
      destination: "BKK",
      arrivalAt: "2026-09-12T10:05:00",
    }),
  ];

  assert.deepEqual(deriveSecondLegDepartureWindow(firstLegOffers), {
    start: "2026-09-12",
    end: "2026-09-18",
  });
});

test("a final arrival on the deadline is accepted and one after it is rejected", () => {
  const deadline = { start: "2026-09-10", end: "2026-09-18" };
  assert.equal(
    isArrivalWithinWindow(createFlightOffer({ arrivalAt: "2026-09-18T23:30:00+03:00" }), deadline),
    true
  );
  assert.equal(
    isArrivalWithinWindow(createFlightOffer({ arrivalAt: "2026-09-19T00:01:00+03:00" }), deadline),
    false
  );
});

test("connection compatibility only checks final arrival when an arrival window is supplied", () => {
  const firstLeg = createFlightOffer({
    destination: "BKK",
    departureAt: "2026-09-10T08:00:00",
    arrivalAt: "2026-09-10T12:00:00",
  });
  const secondLeg = createFlightOffer({
    origin: "BKK",
    departureAt: "2026-09-16T08:00:00",
    arrivalAt: "2026-09-20T12:00:00",
  });

  assert.equal(isCompatibleConnection(firstLeg, secondLeg, "BKK"), true);
  assert.equal(
    isCompatibleConnection(firstLeg, secondLeg, "BKK", {
      start: "2026-09-10",
      end: "2026-09-15",
    }),
    false
  );
});
