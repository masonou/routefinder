import assert from "node:assert/strict";
import test from "node:test";

import { selectDiverseItineraries } from "./deduplicateItineraries.ts";
import type { Itinerary } from "../../types/itinerary.ts";

function itinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  const firstDeparture = "2099-08-10T08:00:00+10:00";
  const firstArrival = "2099-08-10T14:00:00+07:00";
  const secondDeparture = "2099-08-14T09:00:00+07:00";
  const secondArrival = "2099-08-14T17:00:00+03:00";
  return {
    id: "first__second",
    origin: "BNE",
    hub: "BKK",
    destination: "LCA",
    firstLeg: {
      id: "first",
      provider: "test",
      origin: "BNE",
      destination: "BKK",
      departureAt: firstDeparture,
      arrivalAt: firstArrival,
      durationMinutes: 540,
      stops: 0,
      segments: [{ origin: "BNE", destination: "BKK", departureAt: firstDeparture, arrivalAt: firstArrival, airlineName: "Test" }],
      indicativePrice: { amount: 400, currency: "AUD" },
    },
    secondLeg: {
      id: "second",
      provider: "test",
      origin: "BKK",
      destination: "LCA",
      departureAt: secondDeparture,
      arrivalAt: secondArrival,
      durationMinutes: 480,
      stops: 0,
      segments: [{ origin: "BKK", destination: "LCA", departureAt: secondDeparture, arrivalAt: secondArrival, airlineName: "Test" }],
      indicativePrice: { amount: 500, currency: "AUD" },
    },
    hubStayNights: 4,
    totalPrice: { amount: 900, currency: "AUD" },
    totalFlightDurationMinutes: 1020,
    totalStops: 0,
    score: 9000,
    ...overrides,
  };
}

function withTimes(base: Itinerary, firstDeparture: string, secondDeparture: string): Itinerary {
  return {
    ...base,
    firstLeg: { ...base.firstLeg, departureAt: firstDeparture, segments: [{ ...base.firstLeg.segments[0], departureAt: firstDeparture }] },
    secondLeg: { ...base.secondLeg, departureAt: secondDeparture, segments: [{ ...base.secondLeg.segments[0], departureAt: secondDeparture }] },
  };
}

test("exact physical journeys with different offer IDs are reduced and the cheaper offer remains", () => {
  const expensive = itinerary({ id: "offer-a", totalPrice: { amount: 1000, currency: "AUD" }, score: 8000 });
  const cheaper = itinerary({
    id: "offer-b",
    totalPrice: { amount: 800, currency: "AUD" },
    score: 7000,
    firstLeg: { ...expensive.firstLeg, id: "different-first", provider: "searchapi", indicativePrice: { amount: 300, currency: "AUD" } },
    secondLeg: { ...expensive.secondLeg, id: "different-second", provider: "searchapi", indicativePrice: { amount: 500, currency: "AUD" } },
  });
  assert.deepEqual(selectDiverseItineraries([expensive, cheaper], 5).map((item) => item.id), ["offer-b"]);
});

test("identical duplicate offer IDs are reduced to one itinerary", () => {
  const duplicate = itinerary();
  assert.equal(selectDiverseItineraries([duplicate, { ...duplicate }], 5).length, 1);
});

test("near-identical journeys within two hours are reduced", () => {
  const base = itinerary();
  const close = withTimes(itinerary({ id: "close", score: 8900 }), "2099-08-10T09:30:00+10:00", "2099-08-14T10:30:00+07:00");
  assert.equal(selectDiverseItineraries([base, close], 5).length, 1);
});

test("different dates, connection paths, and substantially different times remain separate", () => {
  const base = itinerary();
  const differentDate = withTimes(itinerary({ id: "date", score: 8900 }), "2099-08-11T08:00:00+10:00", "2099-08-15T09:00:00+07:00");
  const differentPath = itinerary({
    id: "path",
    score: 8800,
    firstLeg: {
      ...base.firstLeg,
      segments: [
        { ...base.firstLeg.segments[0], destination: "SIN" },
        { origin: "SIN", destination: "BKK", departureAt: "2099-08-10T12:00:00+08:00", arrivalAt: base.firstLeg.arrivalAt, airlineName: "Test" },
      ],
      stops: 1,
    },
  });
  const differentTime = withTimes(itinerary({ id: "time", score: 8700 }), "2099-08-10T12:30:00+10:00", "2099-08-14T13:30:00+07:00");
  assert.equal(selectDiverseItineraries([base, differentDate, differentPath, differentTime], 5).length, 4);
});

test("the selector returns fewer than five when every alternative is too similar", () => {
  const base = itinerary();
  const variants = [10, 20, 30, 40, 50].map((minutes, index) =>
    withTimes(
      itinerary({ id: `variant-${index}`, score: 8999 - index }),
      `2099-08-10T08:${String(minutes).padStart(2, "0")}:00+10:00`,
      `2099-08-14T09:${String(minutes).padStart(2, "0")}:00+07:00`
    )
  );
  assert.equal(selectDiverseItineraries([base, ...variants], 5).length, 1);
});
