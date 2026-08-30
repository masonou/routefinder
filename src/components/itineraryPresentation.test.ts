import assert from "node:assert/strict";
import test from "node:test";

import type { FlightOffer } from "../types/flight.ts";
import { createItinerary, type Itinerary } from "../types/itinerary.ts";
import {
  getAffiliateClickProperties,
  getConnectionSummary,
  getDirectPriceComparison,
  getFlightConnectionLabel,
  getItineraryTimeline,
  getStopoverHeadline,
  partitionItineraries,
} from "./itineraryPresentation.ts";

function flight(
  id: string,
  origin: string,
  destination: string,
  amount: number,
  options: { stops?: number; via?: string; currency?: string } = {},
): FlightOffer {
  const stops = options.stops ?? 0;
  const via = options.via;
  const segments = via
    ? [
        { origin, destination: via, departureAt: "2099-09-12T08:00:00+00:00", arrivalAt: "2099-09-12T10:00:00+00:00", airlineName: "Test Air" },
        { origin: via, destination, departureAt: "2099-09-12T11:00:00+00:00", arrivalAt: "2099-09-12T16:00:00+00:00", airlineName: "Test Air" },
      ]
    : [{ origin, destination, departureAt: "2099-09-12T08:00:00+00:00", arrivalAt: "2099-09-12T16:00:00+00:00", airlineName: "Test Air" }];

  return {
    id,
    provider: "test",
    origin,
    destination,
    departureAt: "2099-09-12T08:00:00+00:00",
    arrivalAt: "2099-09-12T16:00:00+00:00",
    durationMinutes: stops ? 540 : 480,
    stops,
    segments,
    indicativePrice: { amount, currency: options.currency ?? "EUR" },
  };
}

function direct(amount = 600, currency = "EUR"): Itinerary {
  return createItinerary({
    origin: "LHR",
    destination: "BKK",
    legs: [{ flight: flight("direct", "LHR", "BKK", amount, { currency }) }],
    score: 0,
  });
}

function pragueAdventure(amounts: [number, number] = [200, 363]): Itinerary {
  return createItinerary({
    origin: "LHR",
    destination: "BKK",
    legs: [
      {
        flight: flight("lhr-prg", "LHR", "PRG", amounts[0]),
        stopoverAfter: { airportCode: "PRG", city: "Prague", country: "Czechia", nights: 4 },
      },
      { flight: flight("prg-bkk", "PRG", "BKK", amounts[1], { stops: 1, via: "FRA" }) },
    ],
    score: 0,
  });
}

test("direct baselines are partitioned before stopover adventures while preserving portfolio rank", () => {
  const directOption = direct();
  const adventure = pragueAdventure();
  const { directOptions, adventures } = partitionItineraries([directOption, adventure]);

  assert.deepEqual(directOptions.map(({ itinerary, rank }) => [itinerary.id, rank]), [[directOption.id, 1]]);
  assert.deepEqual(adventures.map(({ itinerary, rank }) => [itinerary.id, rank]), [[adventure.id, 2]]);
  assert.deepEqual(partitionItineraries([directOption]).adventures, []);
});

test("stopover metadata is the adventure hero while airline connections remain flight details", () => {
  const adventure = pragueAdventure();
  const firstStopover = adventure.legs[0]?.stopoverAfter;
  const secondLeg = adventure.legs[1]?.flight;

  assert.ok(firstStopover);
  assert.ok(secondLeg);
  assert.equal(getStopoverHeadline(firstStopover), "4 nights in Prague, Czechia");
  assert.equal(getFlightConnectionLabel(secondLeg), "1 connection · via FRA");
  assert.equal(getConnectionSummary(adventure), "1 connection");
});

test("direct airfare comparisons use only matching-currency final itinerary totals", () => {
  const baseline = direct(600);

  assert.equal(getDirectPriceComparison(pragueAdventure(), baseline), "€37 cheaper than direct");
  assert.equal(getDirectPriceComparison(pragueAdventure([300, 350]), baseline), "€50 more than direct");
  assert.equal(getDirectPriceComparison(pragueAdventure(), undefined), undefined);
  assert.equal(getDirectPriceComparison(pragueAdventure(), direct(600, "USD")), undefined);
});

test("generic three-leg itineraries retain both intentional stopovers in their route timeline", () => {
  const itinerary = createItinerary({
    origin: "BCN",
    destination: "DPS",
    legs: [
      {
        flight: flight("bcn-ist", "BCN", "IST", 150),
        stopoverAfter: { airportCode: "IST", city: "Istanbul", country: "Türkiye", nights: 3 },
      },
      {
        flight: flight("ist-kul", "IST", "KUL", 250),
        stopoverAfter: { airportCode: "KUL", city: "Kuala Lumpur", country: "Malaysia", nights: 2 },
      },
      { flight: flight("kul-dps", "KUL", "DPS", 175) },
    ],
    score: 0,
  });

  assert.deepEqual(getItineraryTimeline(itinerary).map((point) => point.code), ["BCN", "IST", "KUL", "DPS"]);
  const firstStopover = itinerary.legs[0]?.stopoverAfter;
  const secondStopover = itinerary.legs[1]?.stopoverAfter;
  assert.ok(firstStopover);
  assert.ok(secondStopover);
  assert.equal(getStopoverHeadline(firstStopover), "3 nights in Istanbul, Türkiye");
  assert.equal(getStopoverHeadline(secondStopover), "2 nights in Kuala Lumpur, Malaysia");
  assert.equal(getConnectionSummary(itinerary), "All 3 flights nonstop");
});

test("the shared Kiwi action retains one affiliate payload for each selected itinerary", () => {
  const adventure = pragueAdventure();

  assert.deepEqual(getAffiliateClickProperties(adventure, 2), {
    affiliate: "kiwi",
    origin: "LHR",
    destination: "BKK",
    hub: "PRG",
    rank: 2,
    totalPrice: 563,
    currency: "EUR",
    hubStayNights: 4,
  });
});
