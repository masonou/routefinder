import assert from "node:assert/strict";
import test from "node:test";

import { getItineraryDisplayItems } from "./itineraryDisplay.ts";
import { createItinerary } from "../types/itinerary.ts";
import type { FlightOffer } from "../types/flight.ts";

function flight(id: string, origin: string, destination: string): FlightOffer {
  return {
    id,
    provider: "test",
    origin,
    destination,
    departureAt: "2099-01-01T08:00:00+00:00",
    arrivalAt: "2099-01-01T16:00:00+00:00",
    durationMinutes: 480,
    stops: 0,
    segments: [{ origin, destination, departureAt: "2099-01-01T08:00:00+00:00", arrivalAt: "2099-01-01T16:00:00+00:00", airlineName: "Test Air" }],
    indicativePrice: { amount: 100, currency: "EUR" },
  };
}

test("the card display helper interleaves flights and multiple intentional stopovers", () => {
  const itinerary = createItinerary({
    origin: "BCN",
    destination: "DPS",
    legs: [
      {
        flight: flight("bcn-saw", "BCN", "SAW"),
        stopoverAfter: {
          airportCode: "SAW",
          city: "Istanbul",
          country: "Türkiye",
          nights: 3,
        },
      },
      {
        flight: flight("saw-kul", "SAW", "KUL"),
        stopoverAfter: {
          airportCode: "KUL",
          city: "Kuala Lumpur",
          country: "Malaysia",
          nights: 2,
        },
      },
      { flight: flight("kul-dps", "KUL", "DPS") },
    ],
    score: 0,
  });

  assert.deepEqual(getItineraryDisplayItems(itinerary).map((item) =>
    item.kind === "flight" ? `${item.flight.origin} → ${item.flight.destination}` : item.text,
  ), [
    "BCN → SAW",
    "3 nights in Istanbul, Türkiye",
    "SAW → KUL",
    "2 nights in Kuala Lumpur, Malaysia",
    "KUL → DPS",
  ]);
});

test("stopover display prioritises candidate metadata, then the catalogue, then IATA", () => {
  const itinerary = createItinerary({
    origin: "BCN",
    destination: "DPS",
    legs: [
      {
        flight: flight("bcn-ath", "BCN", "ATH"),
        stopoverAfter: {
          airportCode: "ATH",
          city: "Athens",
          country: "Greece",
          nights: 4,
        },
      },
      {
        flight: flight("ath-bkk", "ATH", "BKK"),
        stopoverAfter: { airportCode: "BKK", nights: 2 },
      },
      {
        flight: flight("bkk-xyz", "BKK", "XYZ"),
        stopoverAfter: { airportCode: "XYZ", nights: 3 },
      },
      { flight: flight("xyz-dps", "XYZ", "DPS") },
    ],
    score: 0,
  });

  assert.deepEqual(
    getItineraryDisplayItems(itinerary)
      .filter((item) => item.kind === "stopover")
      .map((item) => item.text),
    [
      "4 nights in Athens, Greece",
      "2 nights in Bangkok, Thailand",
      "3 nights in XYZ",
    ],
  );
});

test("the card display helper does not add a stopover to direct itineraries", () => {
  const itinerary = createItinerary({
    origin: "BCN",
    destination: "DPS",
    legs: [{ flight: flight("direct", "BCN", "DPS") }],
    score: 0,
  });
  assert.deepEqual(getItineraryDisplayItems(itinerary).map((item) => item.kind), ["flight"]);
});
