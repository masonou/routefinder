import assert from "node:assert/strict";
import test from "node:test";

import {
  DIRECT_BASELINE_SCORE,
  discoverDirectItinerary,
  selectBestDirectCalendarDate,
} from "./discoverDirectRoute.ts";
import type { FlightOffer } from "../../types/flight.ts";
import type { FlightCalendarDay, FlightCalendarProvider } from "../providers/types.ts";

function offer(
  id: string,
  departureDate: string,
  price: number,
  durationMinutes: number,
  stops: number,
): FlightOffer {
  return {
    id,
    provider: "test",
    origin: "ATH",
    destination: "SIN",
    departureAt: `${departureDate}T08:00:00+03:00`,
    arrivalAt: `${departureDate}T20:00:00+08:00`,
    durationMinutes,
    stops,
    segments: [{
      origin: "ATH",
      destination: "SIN",
      departureAt: `${departureDate}T08:00:00+03:00`,
      arrivalAt: `${departureDate}T20:00:00+08:00`,
      airlineName: "Test Air",
    }],
    indicativePrice: { amount: price, currency: "EUR" },
    bookingReference: `opaque-${id}`,
  };
}

const calendar: FlightCalendarDay[] = [
  { departureDate: "2026-09-20", currency: "EUR", hasFlights: false },
  { departureDate: "2026-09-21", price: 300, currency: "EUR", hasFlights: true },
  { departureDate: "2026-09-22", price: 350, currency: "EUR", hasFlights: true },
  { departureDate: "2026-09-23", price: 320, currency: "EUR", hasFlights: true },
];

test("selects the cheapest usable direct Calendar date with an earlier-date tie-break", () => {
  assert.equal(
    selectBestDirectCalendarDate(calendar, "2026-09-20", "2026-09-23"),
    "2026-09-21",
  );
  assert.equal(
    selectBestDirectCalendarDate([
      { departureDate: "2026-09-22", price: 300, currency: "EUR", hasFlights: true },
      { departureDate: "2026-09-21", price: 300, currency: "EUR", hasFlights: true },
    ], "2026-09-20", "2026-09-23"),
    "2026-09-21",
  );
});

test("builds a direct itinerary from the cheapest verified nonstop detailed offer", async () => {
  let calendarCalls = 0;
  let detailedCalls = 0;
  let calendarInput: Parameters<FlightCalendarProvider["getFlightCalendar"]>[0] | undefined;
  const itinerary = await discoverDirectItinerary(
    { origin: "ATH", destination: "SIN", earliestDeparture: "2026-09-20", adults: 2 },
    {
      calendarCache: null,
      flightOffersCache: null,
      flightCalendarProvider: {
        async getFlightCalendar(input) {
          calendarCalls += 1;
          calendarInput = input;
          return calendar;
        },
      },
      flightProvider: {
        name: "test",
        async searchOneWay(input) {
          detailedCalls += 1;
          assert.deepEqual(input.departureWindow, { start: "2026-09-21", end: "2026-09-21" });
          assert.equal(input.adults, 2);
          return [
            offer("connection", "2026-09-21", 100, 500, 1),
            offer("slower", "2026-09-21", 320, 700, 0),
            offer("best", "2026-09-21", 310, 650, 0),
            offer("best-shorter", "2026-09-21", 310, 620, 0),
          ];
        },
      },
    },
  );

  assert.equal(calendarCalls, 1);
  assert.equal(detailedCalls, 1);
  assert.deepEqual(calendarInput, {
    origin: "ATH",
    destination: "SIN",
    departureWindow: { start: "2026-09-20", end: "2026-09-23" },
    stopPolicy: "nonstop",
  });
  assert.equal(itinerary?.legs.length, 1);
  assert.deepEqual(itinerary?.legs[0]?.stopoverAfter, undefined);
  assert.equal(itinerary?.legs[0]?.flight.id, "best-shorter");
  assert.equal(itinerary?.legs[0]?.flight.bookingReference, "opaque-best-shorter");
  assert.deepEqual(itinerary?.totalPrice, { amount: 310, currency: "EUR" });
  assert.equal(itinerary?.totalFlightDurationMinutes, 620);
  assert.equal(itinerary?.totalStops, 0);
  assert.equal(itinerary?.score, DIRECT_BASELINE_SCORE);
});

test("omits a direct baseline safely when detailed results contain no nonstop flight", async () => {
  const warnings: string[] = [];
  const itinerary = await discoverDirectItinerary(
    { origin: "ATH", destination: "SIN", earliestDeparture: "2026-09-20" },
    {
      calendarCache: null,
      flightOffersCache: null,
      flightCalendarProvider: { async getFlightCalendar() { return calendar; } },
      flightProvider: { name: "test", async searchOneWay() { return [offer("connection", "2026-09-21", 100, 500, 1)]; } },
      warn: (message) => warnings.push(message),
    },
  );
  assert.equal(itinerary, undefined);
  assert.match(warnings[0] ?? "", /Calendar\/detailed mismatch/);
});

test("direct discovery failures are supplementary and do not throw", async () => {
  const warnings: string[] = [];
  const itinerary = await discoverDirectItinerary(
    { origin: "ATH", destination: "SIN", earliestDeparture: "2026-09-20" },
    {
      calendarCache: null,
      flightOffersCache: null,
      flightCalendarProvider: { async getFlightCalendar() { throw new Error("Calendar unavailable"); } },
      flightProvider: { name: "test", async searchOneWay() { return []; } },
      warn: (message) => warnings.push(message),
    },
  );
  assert.equal(itinerary, undefined);
  assert.match(warnings[0] ?? "", /Direct route discovery failed/);
});
