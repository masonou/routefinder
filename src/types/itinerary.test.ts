import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateItineraryFlightDuration,
  calculateItineraryStops,
  calculateItineraryTotalPrice,
  createItinerary,
  getItineraryStopovers,
  type ItineraryLeg,
} from "./itinerary.ts";
import type { FlightOffer } from "./flight.ts";

function flight(
  id: string,
  origin: string,
  destination: string,
  price: number,
  durationMinutes: number,
  stops: number,
): FlightOffer {
  return {
    id,
    provider: "test",
    origin,
    destination,
    departureAt: `2099-01-0${id.length}T08:00:00+00:00`,
    arrivalAt: `2099-01-0${id.length}T16:00:00+00:00`,
    durationMinutes,
    stops,
    segments: [{
      origin,
      destination,
      departureAt: `2099-01-0${id.length}T08:00:00+00:00`,
      arrivalAt: `2099-01-0${id.length}T16:00:00+00:00`,
      airlineName: "Test Air",
    }],
    indicativePrice: { amount: price, currency: "EUR" },
  };
}

test("a direct itinerary has one leg and no intentional stopovers", () => {
  const itinerary = createItinerary({
    origin: "BCN",
    destination: "DPS",
    legs: [{ flight: flight("direct", "BCN", "DPS", 400, 900, 1) }],
    score: 12,
  });

  assert.equal(itinerary.legs.length, 1);
  assert.deepEqual(getItineraryStopovers(itinerary), []);
  assert.deepEqual(itinerary.totalPrice, { amount: 400, currency: "EUR" });
  assert.equal(itinerary.totalFlightDurationMinutes, 900);
  assert.equal(itinerary.totalStops, 1);
});

test("one intentional stopover is stored after its arriving itinerary leg", () => {
  const itinerary = createItinerary({
    origin: "BCN",
    destination: "DPS",
    legs: [
      {
        flight: flight("bcn-ist", "BCN", "IST", 150, 210, 0),
        stopoverAfter: {
          airportCode: "IST",
          city: "Istanbul",
          country: "Türkiye",
          nights: 3,
        },
      },
      { flight: flight("ist-dps", "IST", "DPS", 350, 660, 1) },
    ],
    score: 12,
  });

  assert.equal(itinerary.legs.length, 2);
  assert.deepEqual(getItineraryStopovers(itinerary), [{
    airportCode: "IST",
    city: "Istanbul",
    country: "Türkiye",
    nights: 3,
  }]);
  assert.deepEqual(itinerary.totalPrice, { amount: 500, currency: "EUR" });
  assert.equal(itinerary.totalFlightDurationMinutes, 870);
  assert.equal(itinerary.totalStops, 1);
});

test("three legs aggregate independently from two intentional stopovers", () => {
  const legs: ItineraryLeg[] = [
    { flight: flight("bcn-saw", "BCN", "SAW", 100, 180, 0), stopoverAfter: { airportCode: "SAW", nights: 3 } },
    { flight: flight("saw-kul", "SAW", "KUL", 250, 600, 1), stopoverAfter: { airportCode: "KUL", nights: 2 } },
    { flight: flight("kul-dps", "KUL", "DPS", 175, 180, 0) },
  ];
  const itinerary = createItinerary({ origin: "BCN", destination: "DPS", legs, score: 12 });

  assert.deepEqual(getItineraryStopovers(itinerary), [
    { airportCode: "SAW", nights: 3 },
    { airportCode: "KUL", nights: 2 },
  ]);
  assert.deepEqual(calculateItineraryTotalPrice(legs), { amount: 525, currency: "EUR" });
  assert.equal(calculateItineraryFlightDuration(legs), 960);
  assert.equal(calculateItineraryStops(legs), 1);
  assert.match(itinerary.id, /^BCN__DPS__bcn-saw~/);
});

test("the constructor rejects invalid stopovers and incompatible leg currencies", () => {
  assert.throws(
    () => createItinerary({
      origin: "BCN",
      destination: "DPS",
      legs: [{ flight: flight("direct", "BCN", "DPS", 400, 900, 0), stopoverAfter: { airportCode: "DPS", nights: 1 } }],
      score: 0,
    }),
    /final itinerary leg/,
  );
  assert.throws(
    () => calculateItineraryTotalPrice([
      { flight: flight("a", "BCN", "IST", 100, 180, 0) },
      { flight: { ...flight("b", "IST", "DPS", 100, 180, 0), indicativePrice: { amount: 100, currency: "AUD" } } },
    ]),
    /currencies must match/,
  );
});
