import assert from "node:assert/strict";
import test from "node:test";

import type { FlightOffer } from "../../types/flight.ts";
import type { ValidatedHubCandidate } from "./validateHubCandidates.ts";
import {
  discoverTwoStopRoutes,
  observedConnectionsByH1,
  rankTwoStopH2Candidates,
  shouldExploreTwoStopovers,
} from "./discoverTwoStopRoutes.ts";

function offer(origin: string, destination: string, date: string, price = 100, stops = 0): FlightOffer {
  return {
    id: `${origin}-${destination}-${date}-${stops}`,
    provider: "test",
    origin,
    destination,
    departureAt: `${date}T08:00:00`,
    arrivalAt: `${date}T16:00:00`,
    durationMinutes: 480,
    stops,
    segments: [{ origin, destination, departureAt: `${date}T08:00:00`, arrivalAt: `${date}T16:00:00`, airlineName: "Test Air" }],
    indicativePrice: { amount: price, currency: "EUR" },
  };
}

const bangkok: ValidatedHubCandidate = {
  airportCode: "BKK", city: "Bangkok", country: "Thailand",
  firstLegDepartureDate: "2026-09-01", latitude: 13.6811, longitude: 100.747002,
  source: "explore", detourRatio: 1.2, originToHubDistanceKm: 1, hubToDestinationDistanceKm: 1,
  candidateScore: 10, onwardPolicy: "nonstop", onwardOptions: [], bestOnwardDate: "2026-09-05",
  bestOnwardPrice: 200, bestStayNights: 4, validationScore: 10,
};

test("two-stop eligibility is limited to long routes with portfolio space", () => {
  assert.deepEqual(
    shouldExploreTwoStopovers({ directDistanceKm: 3_000, cleanOneStopAdventureCount: 0 }),
    { eligible: false, targetResults: 0, reason: "short_distance" },
  );
  assert.deepEqual(
    shouldExploreTwoStopovers({ directDistanceKm: 10_000, cleanOneStopAdventureCount: 1 }),
    { eligible: true, targetResults: 3, reason: "eligible" },
  );
  assert.deepEqual(
    shouldExploreTwoStopovers({ directDistanceKm: 10_000, cleanOneStopAdventureCount: 3 }),
    { eligible: false, targetResults: 0, reason: "portfolio_full" },
  );
});

test("H2 discovery combines observed connections with Explore and excludes endpoints", () => {
  const candidates = rankTwoStopH2Candidates({
    origin: "BNE", h1: bangkok, destination: "LCA",
    observedConnections: [{ airportCode: "IST", city: "Istanbul", country: "Türkiye" }],
    exploreDestinations: [
      { airportCode: "IST", city: "Istanbul", country: "Türkiye", latitude: 41.2753, longitude: 28.7519, outboundDate: "2026-09-04", indicativePrice: 180, currency: "EUR", flightDurationMinutes: 600 },
      { airportCode: "LCA", city: "Larnaca", country: "Cyprus", latitude: 34.8751, longitude: 33.6249, outboundDate: "2026-09-04" },
    ],
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.airportCode, "IST");
  assert.equal(candidates[0]?.source, "observed_connection+explore");
  assert.ok((candidates[0]?.combinedPathDetourRatio ?? Infinity) <= 2);

  const evidence = observedConnectionsByH1([{
    airportCode: "BKK", leg: "second", origin: "BKK", destination: "LCA", departureDate: "2026-09-05",
    cacheStatus: "MISS", offers: [{ ...offer("BKK", "LCA", "2026-09-05", 100, 1), segments: [
      { origin: "BKK", destination: "IST", departureAt: "2026-09-05T08:00:00", arrivalAt: "2026-09-05T12:00:00", airlineName: "Test Air" },
      { origin: "IST", destination: "LCA", departureAt: "2026-09-05T14:00:00", arrivalAt: "2026-09-05T16:00:00", airlineName: "Test Air" },
    ] }],
  }]);
  assert.equal(evidence.get("BKK")?.[0]?.airportCode, "IST");
});

test("three verified nonstop legs produce retained generic two-stop itineraries up to the category target", async () => {
  const result = await discoverTwoStopRoutes(
    { origin: "BNE", destination: "LCA", adults: 1, h1Candidates: [bangkok], observedConnections: new Map(), targetResults: 3 },
    {
      directDestinationsCache: null, flightCalendarCache: null, flightOffersCache: null,
      directDestinationsProvider: { async getDirectDestinations() {
        return [
          { airportCode: "IST", city: "Istanbul", country: "Türkiye", latitude: 41.2753, longitude: 28.7519, outboundDate: "2026-09-04", indicativePrice: 180, currency: "EUR", flightDurationMinutes: 600 },
          { airportCode: "DOH", city: "Doha", country: "Qatar", latitude: 25.273056, longitude: 51.608056, outboundDate: "2026-09-04", indicativePrice: 190, currency: "EUR", flightDurationMinutes: 420 },
          { airportCode: "KUL", city: "Kuala Lumpur", country: "Malaysia", latitude: 2.7456, longitude: 101.7099, outboundDate: "2026-09-04", indicativePrice: 200, currency: "EUR", flightDurationMinutes: 150 },
        ];
      } },
      flightCalendarProvider: { async getFlightCalendar(input) {
        return [{ departureDate: input.departureWindow.start === "2026-09-03" ? "2026-09-04" : "2026-09-07", price: 100, currency: "EUR", hasFlights: true }];
      } },
      flightProvider: { name: "test", async searchOneWay(input) {
        if (input.origin === "BNE") return [offer("BNE", "BKK", "2026-09-01")];
        if (input.origin === "BKK") return [offer("BKK", input.destination, "2026-09-04")];
        return [offer(input.origin, "LCA", "2026-09-07")];
      } },
    },
  );
  assert.equal(result.itineraries.length, 3);
  const itinerary = result.itineraries[0];
  assert.equal(itinerary?.legs.length, 3);
  assert.deepEqual(itinerary?.legs.map((leg) => leg.stopoverAfter?.nights), [3, 3, undefined]);
  assert.equal(itinerary?.totalStops, 0);
  assert.equal(itinerary?.totalPrice.amount, 300);
  assert.equal(new Set(result.itineraries.map((entry) => entry.legs[1]?.flight.destination)).size, 3);
});
