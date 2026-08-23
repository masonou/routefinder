import assert from "node:assert/strict";
import test from "node:test";

import type { FlightOffer } from "../../types/flight.ts";
import type { ValidatedHubCandidate } from "./validateHubCandidates.ts";
import {
  rankVerifiedRoutes,
  type VerifiedHubRoute,
} from "./verifyHubCandidates.ts";

function offer(origin: string, destination: string): FlightOffer {
  return {
    id: `${origin}-${destination}`,
    provider: "test",
    origin,
    destination,
    departureAt: "2026-09-01T08:00:00",
    arrivalAt: "2026-09-01T10:00:00",
    durationMinutes: 120,
    stops: 0,
    segments: [
      {
        origin,
        destination,
        departureAt: "2026-09-01T08:00:00",
        arrivalAt: "2026-09-01T10:00:00",
        airlineName: "Test",
      },
    ],
    indicativePrice: { amount: 100, currency: "EUR" },
  };
}

function route(
  airportCode: string,
  {
    price,
    durationMinutes,
    stops,
    detourRatio,
    stayNights,
  }: {
    price: number;
    durationMinutes: number;
    stops: number;
    detourRatio: number;
    stayNights: number;
  },
): VerifiedHubRoute {
  const hub = {
    airportCode,
    city: airportCode,
    country: "Test",
    firstLegDepartureDate: "2026-09-01",
    latitude: 0,
    longitude: 0,
    source: "explore",
    detourRatio,
    originToHubDistanceKm: 1,
    hubToDestinationDistanceKm: 1,
    candidateScore: 1,
    onwardOptions: [],
    bestOnwardDate: "2026-09-05",
    bestOnwardPrice: price,
    bestStayNights: stayNights,
    validationScore: 1,
  } satisfies ValidatedHubCandidate;
  return {
    hub,
    firstLeg: offer("ORG", airportCode),
    secondLeg: offer(airportCode, "DST"),
    hubStayNights: stayNights,
    totalPrice: { amount: price, currency: "EUR" },
    totalFlightDurationMinutes: durationMinutes,
    totalStops: stops,
    score: 0,
    scoreBreakdown: { price: 0, duration: 0, stops: 0, detour: 0, stay: 0, final: 0 },
  };
}

test("uses stable cheapest and shortest ratios instead of min/max normalization", () => {
  const result = rankVerifiedRoutes([
    route("ATH", { price: 400, durationMinutes: 22 * 60 + 15, stops: 1, detourRatio: 1.0, stayNights: 4 }),
    route("DXB", { price: 800, durationMinutes: 23 * 60 + 10, stops: 1, detourRatio: 1.0, stayNights: 4 }),
  ]);
  const ath = result.verifiedRoutes.find((entry) => entry.hub.airportCode === "ATH");
  const dxb = result.verifiedRoutes.find((entry) => entry.hub.airportCode === "DXB");

  assert.equal(ath?.scoreBreakdown.price, 100);
  assert.equal(dxb?.scoreBreakdown.price, 50);
  assert.equal(ath?.scoreBreakdown.duration, 100);
  assert.ok((dxb?.scoreBreakdown.duration ?? 0) > 95);
  assert.ok((dxb?.scoreBreakdown.duration ?? 0) < 100);
});

test("uses the 45/30/10/10/5 weighted score and retains absolute quality for a single route", () => {
  const [best, worst] = rankVerifiedRoutes([
    route("BEST", { price: 100, durationMinutes: 100, stops: 0, detourRatio: 1, stayNights: 4 }),
    route("WORST", { price: 200, durationMinutes: 200, stops: 1, detourRatio: 2, stayNights: 2 }),
  ]).verifiedRoutes;

  assert.equal(best?.score, 100);
  assert.equal(worst?.score, 47.5);

  const [single] = rankVerifiedRoutes([
    route("ONLY", { price: 100, durationMinutes: 100, stops: 1, detourRatio: 1.2, stayNights: 4 }),
  ]).verifiedRoutes;
  assert.equal(single?.scoreBreakdown.price, 100);
  assert.equal(single?.scoreBreakdown.duration, 100);
  assert.equal(single?.scoreBreakdown.stops, 70);
  assert.equal(single?.scoreBreakdown.detour, 66.667);
  assert.equal(single?.score, 93.667);
  assert.ok(Number.isFinite(single?.score ?? Number.NaN));
});

test("handles equal prices and durations safely while using fixed stops, detour, and stay scales", () => {
  const result = rankVerifiedRoutes([
    route("NONSTOP", { price: 400, durationMinutes: 1_000, stops: 0, detourRatio: 1.0, stayNights: 4 }),
    route("ONE", { price: 400, durationMinutes: 1_000, stops: 1, detourRatio: 1.3, stayNights: 3 }),
    route("TWO", { price: 400, durationMinutes: 1_000, stops: 2, detourRatio: 1.6, stayNights: 2 }),
  ]);
  const byCode = new Map(result.verifiedRoutes.map((entry) => [entry.hub.airportCode, entry]));

  assert.equal(byCode.get("NONSTOP")?.scoreBreakdown.price, 100);
  assert.equal(byCode.get("ONE")?.scoreBreakdown.price, 100);
  assert.equal(byCode.get("NONSTOP")?.scoreBreakdown.duration, 100);
  assert.equal(byCode.get("ONE")?.scoreBreakdown.duration, 100);
  assert.equal(byCode.get("NONSTOP")?.scoreBreakdown.stops, 100);
  assert.equal(byCode.get("ONE")?.scoreBreakdown.stops, 70);
  assert.equal(byCode.get("TWO")?.scoreBreakdown.stops, 40);
  assert.equal(byCode.get("NONSTOP")?.scoreBreakdown.detour, 100);
  assert.equal(byCode.get("ONE")?.scoreBreakdown.detour, 50);
  assert.equal(byCode.get("TWO")?.scoreBreakdown.detour, 0);
  assert.equal(byCode.get("NONSTOP")?.scoreBreakdown.stay, 100);
  assert.equal(byCode.get("ONE")?.scoreBreakdown.stay, 80);
  assert.equal(byCode.get("TWO")?.scoreBreakdown.stay, 60);
  const [over] = rankVerifiedRoutes([
    route("OVER", { price: 400, durationMinutes: 1_000, stops: 2, detourRatio: 1.7, stayNights: 6 }),
  ]).verifiedRoutes;
  assert.equal(over?.scoreBreakdown.detour, 0);
  assert.equal(over?.scoreBreakdown.stay, 60);
});

test("rejects extreme-duration routes with insufficient savings", () => {
  const result = rankVerifiedRoutes([
    route("FAST", { price: 500, durationMinutes: 20 * 60, stops: 1, detourRatio: 1.1, stayNights: 4 }),
    route("SLOW", { price: 480, durationMinutes: 35 * 60, stops: 1, detourRatio: 1.1, stayNights: 4 }),
  ]);

  assert.deepEqual(result.verifiedRoutes.map((entry) => entry.hub.airportCode), ["FAST"]);
  assert.match(result.rejected[0]?.reason ?? "", /Duration outlier/);
  assert.match(result.rejected[0]?.reason ?? "", /22%/);
});

test("keeps an extreme-duration route when its savings are substantial", () => {
  const result = rankVerifiedRoutes([
    route("FAST", { price: 800, durationMinutes: 20 * 60, stops: 1, detourRatio: 1.1, stayNights: 4 }),
    route("VALUE", { price: 500, durationMinutes: 30 * 60, stops: 1, detourRatio: 1.1, stayNights: 4 }),
  ]);

  assert.deepEqual(result.rejected, []);
  assert.equal(result.verifiedRoutes.length, 2);
});

test("does not treat a modestly longer route as an extreme-duration outlier and remains deterministic", () => {
  const routes = [
    route("FAST", { price: 500, durationMinutes: 20 * 60, stops: 1, detourRatio: 1.1, stayNights: 4 }),
    route("MODEST", { price: 450, durationMinutes: 24 * 60, stops: 1, detourRatio: 1.1, stayNights: 4 }),
  ];
  const first = rankVerifiedRoutes(routes);
  const second = rankVerifiedRoutes(routes);

  assert.deepEqual(first.rejected, []);
  assert.deepEqual(
    first.verifiedRoutes.map((entry) => entry.hub.airportCode),
    second.verifiedRoutes.map((entry) => entry.hub.airportCode),
  );
  assert.deepEqual(
    first.verifiedRoutes.map((entry) => entry.scoreBreakdown),
    second.verifiedRoutes.map((entry) => entry.scoreBreakdown),
  );
});
