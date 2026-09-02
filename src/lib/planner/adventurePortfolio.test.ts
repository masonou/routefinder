import assert from "node:assert/strict";
import test from "node:test";

import { createItinerary, type Itinerary } from "../../types/itinerary.ts";
import type { FlightOffer } from "../../types/flight.ts";
import { shouldExploreTwoStopovers } from "./discoverTwoStopRoutes.ts";
import {
  assembleDefaultAdventurePortfolio,
  isCleanOneStopAdventure,
  isConnectingOneStopAdventure,
  partitionOneStopAdventures,
} from "./adventurePortfolio.ts";

function flight(id: string, origin: string, destination: string, stops = 0): FlightOffer {
  return {
    id, provider: "test", origin, destination,
    departureAt: "2026-09-01T08:00:00", arrivalAt: "2026-09-01T16:00:00",
    durationMinutes: 480, stops,
    segments: [{ origin, destination, departureAt: "2026-09-01T08:00:00", arrivalAt: "2026-09-01T16:00:00", airlineName: "Test Air" }],
    indicativePrice: { amount: 100, currency: "EUR" },
  };
}

function oneStop(id: string, onwardStops = 0): Itinerary {
  return createItinerary({
    origin: "BNE", destination: "LCA", score: 50,
    legs: [
      { flight: flight(`${id}-first`, "BNE", "BKK"), stopoverAfter: { airportCode: "BKK", nights: 3 } },
      { flight: flight(`${id}-final`, "BKK", "LCA", onwardStops) },
    ],
  });
}

function twoStop(id: string): Itinerary {
  return createItinerary({
    origin: "BNE", destination: "LCA", score: 50,
    legs: [
      { flight: flight(`${id}-first`, "BNE", "BKK"), stopoverAfter: { airportCode: "BKK", nights: 3 } },
      { flight: flight(`${id}-middle`, "BKK", "IST"), stopoverAfter: { airportCode: "IST", nights: 3 } },
      { flight: flight(`${id}-final`, "IST", "LCA") },
    ],
  });
}

test("final verified legs, not discovery path, classify clean and connecting one-stops", () => {
  const clean = oneStop("fallback-path-but-clean", 0);
  const connecting = oneStop("connecting", 1);
  assert.equal(isCleanOneStopAdventure(clean), true);
  assert.equal(isConnectingOneStopAdventure(clean), false);
  assert.equal(isCleanOneStopAdventure(connecting), false);
  assert.equal(isConnectingOneStopAdventure(connecting), true);
});

test("connecting one-stops leave clean slots available for two-stop discovery", () => {
  const categories = partitionOneStopAdventures([
    oneStop("clean"), oneStop("fallback-1", 1), oneStop("fallback-2", 2),
  ]);
  assert.equal(categories.clean.length, 1);
  assert.equal(categories.connecting.length, 2);
  assert.deepEqual(
    shouldExploreTwoStopovers({ directDistanceKm: 12_000, cleanOneStopAdventureCount: categories.clean.length }),
    { eligible: true, slotsNeeded: 2, reason: "eligible" },
  );
});

test("default portfolio prioritizes clean one-stop, then clean two-stop, then connecting fallback", () => {
  const cleanA = oneStop("clean-a");
  const fallbackA = oneStop("fallback-a", 1);
  const fallbackB = oneStop("fallback-b", 2);
  const firstTwoStop = twoStop("two-a");
  const secondTwoStop = twoStop("two-b");
  const portfolio = assembleDefaultAdventurePortfolio({
    oneStopAdventures: [cleanA, fallbackA, fallbackB],
    twoStopAdventures: [firstTwoStop, secondTwoStop],
  });
  assert.deepEqual(portfolio.itineraries.map((itinerary) => itinerary.id), [
    cleanA.id, firstTwoStop.id, secondTwoStop.id,
  ]);
  assert.deepEqual(portfolio.suppressedConnectingOneStop.map((itinerary) => itinerary.id), [
    fallbackA.id, fallbackB.id,
  ]);
});

test("connecting fallbacks fill the remaining default slots when two-stop verification is empty", () => {
  const cleanA = oneStop("clean-a");
  const fallbackA = oneStop("fallback-a", 1);
  const fallbackB = oneStop("fallback-b", 2);
  const portfolio = assembleDefaultAdventurePortfolio({
    oneStopAdventures: [cleanA, fallbackA, fallbackB], twoStopAdventures: [],
  });
  assert.deepEqual(portfolio.itineraries.map((itinerary) => itinerary.id), [
    cleanA.id, fallbackA.id, fallbackB.id,
  ]);
});

test("three clean one-stops skip two-stop discovery", () => {
  assert.deepEqual(
    shouldExploreTwoStopovers({ directDistanceKm: 12_000, cleanOneStopAdventureCount: 3 }),
    { eligible: false, slotsNeeded: 0, reason: "portfolio_full" },
  );
});
