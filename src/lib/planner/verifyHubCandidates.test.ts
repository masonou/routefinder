import assert from "node:assert/strict";
import test from "node:test";

import { MAX_VERIFIED_HUBS } from "../constants/planner.ts";
import type { FlightProvider } from "../providers/types.ts";
import type { FlightOffer } from "../../types/flight.ts";
import type { ValidatedHubCandidate } from "./validateHubCandidates.ts";
import { verifyHubCandidates } from "./verifyHubCandidates.ts";

function hub(
  airportCode: string,
  overrides: Partial<ValidatedHubCandidate> = {},
): ValidatedHubCandidate {
  return {
    airportCode,
    city: airportCode,
    country: "Test country",
    firstLegDepartureDate: "2026-09-01",
    latitude: 0,
    longitude: 0,
    source: "explore",
    detourRatio: 1.1,
    originToHubDistanceKm: 1_000,
    hubToDestinationDistanceKm: 2_000,
    indicativeFirstLegPrice: 100,
    currency: "EUR",
    firstLegDurationMinutes: 120,
    candidateScore: 500,
    onwardPolicy: "connecting_fallback",
    onwardOptions: [],
    bestOnwardDate: "2026-09-05",
    bestOnwardPrice: 200,
    bestStayNights: 4,
    estimatedTotalPrice: 300,
    validationScore: 80,
    ...overrides,
  };
}

function offer(
  id: string,
  origin: string,
  destination: string,
  departureDate: string,
  price: number,
  durationMinutes: number,
  stops = 0,
  currency = "EUR",
): FlightOffer {
  const departureAt = `${departureDate}T08:00:00`;
  const arrivalAt = `${departureDate}T${String(8 + Math.min(10, Math.ceil(durationMinutes / 60))).padStart(2, "0")}:00:00`;
  const segments = Array.from({ length: stops + 1 }, (_, index) => ({
    origin: index === 0 ? origin : `X${index}`,
    destination: index === stops ? destination : `X${index + 1}`,
    departureAt: `${departureDate}T${String(8 + index).padStart(2, "0")}:00:00`,
    arrivalAt: `${departureDate}T${String(9 + index).padStart(2, "0")}:00:00`,
    airlineName: `Air ${id}`,
  }));
  return {
    id,
    provider: "test",
    origin,
    destination,
    departureAt,
    arrivalAt,
    durationMinutes,
    stops,
    segments,
    indicativePrice: { amount: price, currency },
  };
}

function providerWith(routes: Record<string, FlightOffer[]>): FlightProvider {
  return {
    name: "test",
    async searchOneWay(input) {
      return routes[`${input.origin}-${input.destination}`] ?? [];
    },
  };
}

test("verifies a two-leg route and replaces Calendar estimates with detailed prices", async () => {
  const result = await verifyHubCandidates(
    { origin: "LCA", destination: "DPS", candidates: [hub("ATH")] },
    providerWith({
      "LCA-ATH": [offer("first", "LCA", "ATH", "2026-09-01", 125, 120)],
      "ATH-DPS": [offer("second", "ATH", "DPS", "2026-09-05", 330, 600, 1)],
    }),
    { cache: null },
  );

  const [route] = result.verifiedRoutes;
  assert.equal(route?.firstLeg.stops, 0);
  assert.equal(route?.secondLeg.stops, 1);
  assert.deepEqual(route?.totalPrice, { amount: 455, currency: "EUR" });
  assert.equal(route?.hubStayNights, 4);
  assert.equal(route?.calendarEstimatedTotal, 300);
  assert.equal(route?.calendarDifference, 155);
});

test("requires a nonstop first leg and permits onward routes with at most two stops", async () => {
  const noNonstop = await verifyHubCandidates(
    { origin: "LCA", destination: "DPS", candidates: [hub("DXB")] },
    providerWith({
      "LCA-DXB": [offer("connecting", "LCA", "DXB", "2026-09-01", 100, 200, 1)],
      "DXB-DPS": [offer("onward", "DXB", "DPS", "2026-09-05", 200, 500)],
    }),
    { cache: null },
  );
  assert.match(noNonstop.rejected[0]?.reason ?? "", /nonstop/);

  const tooManyOnwardStops = await verifyHubCandidates(
    { origin: "LCA", destination: "DPS", candidates: [hub("BUD")] },
    providerWith({
      "LCA-BUD": [offer("first", "LCA", "BUD", "2026-09-01", 100, 150)],
      "BUD-DPS": [offer("three-stops", "BUD", "DPS", "2026-09-05", 200, 600, 3)],
    }),
    { cache: null },
  );
  assert.match(tooManyOnwardStops.rejected[0]?.reason ?? "", /two stops or fewer/);
});

test("enforces a clean Calendar candidate's nonstop detailed onward policy", async () => {
  const result = await verifyHubCandidates(
    { origin: "LCA", destination: "DPS", candidates: [hub("ATH", { onwardPolicy: "nonstop" })] },
    providerWith({
      "LCA-ATH": [offer("first", "LCA", "ATH", "2026-09-01", 100, 120)],
      "ATH-DPS": [offer("connection", "ATH", "DPS", "2026-09-05", 200, 600, 1)],
    }),
    { cache: null },
  );

  assert.deepEqual(result.verifiedRoutes, []);
  assert.match(result.rejected[0]?.reason ?? "", /nonstop detailed onward/);
});

test("keeps fallback connections but upgrades a fallback detailed nonstop offer to clean", async () => {
  const connecting = await verifyHubCandidates(
    { origin: "LCA", destination: "DPS", candidates: [hub("ATH")] },
    providerWith({
      "LCA-ATH": [offer("first", "LCA", "ATH", "2026-09-01", 100, 120)],
      "ATH-DPS": [offer("connection", "ATH", "DPS", "2026-09-05", 200, 600, 1)],
    }),
    { cache: null },
  );
  assert.equal(connecting.verifiedRoutes[0]?.onwardPolicy, "connecting_fallback");

  const upgraded = await verifyHubCandidates(
    { origin: "LCA", destination: "DPS", candidates: [hub("DXB")] },
    providerWith({
      "LCA-DXB": [offer("first", "LCA", "DXB", "2026-09-01", 100, 120)],
      "DXB-DPS": [offer("nonstop", "DXB", "DPS", "2026-09-05", 200, 600)],
    }),
    { cache: null },
  );
  assert.equal(upgraded.verifiedRoutes[0]?.onwardPolicy, "nonstop");
});

test("selects an onward route where substantial flight quality beats a small saving", async () => {
  const result = await verifyHubCandidates(
    { origin: "LCA", destination: "DPS", candidates: [hub("ATH")] },
    providerWith({
      "LCA-ATH": [offer("first", "LCA", "ATH", "2026-09-01", 100, 100)],
      "ATH-DPS": [
        offer("slow-cheap", "ATH", "DPS", "2026-09-05", 200, 1_000, 2),
        offer("fast", "ATH", "DPS", "2026-09-05", 230, 500, 1),
      ],
    }),
    { cache: null },
  );
  assert.equal(result.verifiedRoutes[0]?.secondLeg.id, "fast");
});

test("isolates provider failures and bounds detailed searches to two legs per final hub", async () => {
  let calls = 0;
  const provider: FlightProvider = {
    name: "test",
    async searchOneWay(input) {
      calls += 1;
      if (input.destination === "BAD") {
        throw new Error("upstream unavailable");
      }
      if (input.origin === "LCA") {
        return [offer(`first-${input.destination}`, "LCA", input.destination, "2026-09-01", 100, 100)];
      }
      return [offer(`second-${input.origin}`, input.origin, "DPS", "2026-09-05", 200, 400)];
    },
  };
  const candidates = [hub("GOOD"), hub("BAD"), hub("OTHER"), hub("EXTRA")];
  const result = await verifyHubCandidates(
    { origin: "LCA", destination: "DPS", candidates },
    provider,
    { cache: null, warn: () => {} },
  );

  assert.equal(calls, MAX_VERIFIED_HUBS * 2);
  assert.deepEqual(result.verifiedRoutes.map((route) => route.hub.airportCode), ["GOOD", "OTHER"]);
  assert.deepEqual(result.failures, [{ airportCode: "BAD", message: "upstream unavailable" }]);
});

test("rejects currency mismatches and ranks cheaper routes ahead of longer, stop-heavy alternatives", async () => {
  const result = await verifyHubCandidates(
    {
      origin: "LCA",
      destination: "DPS",
      candidates: [hub("CHEAP", { detourRatio: 1.4 }), hub("EXPENSIVE", { detourRatio: 1.0 }), hub("USD")],
    },
    providerWith({
      "LCA-CHEAP": [offer("cheap-first", "LCA", "CHEAP", "2026-09-01", 100, 100)],
      "CHEAP-DPS": [offer("cheap-second", "CHEAP", "DPS", "2026-09-05", 100, 250)],
      "LCA-EXPENSIVE": [offer("exp-first", "LCA", "EXPENSIVE", "2026-09-01", 160, 100)],
      "EXPENSIVE-DPS": [offer("exp-second", "EXPENSIVE", "DPS", "2026-09-05", 180, 500, 2)],
      "LCA-USD": [offer("usd-first", "LCA", "USD", "2026-09-01", 100, 100, 0, "USD")],
      "USD-DPS": [offer("usd-second", "USD", "DPS", "2026-09-05", 100, 250, 0, "EUR")],
    }),
    { cache: null },
  );

  assert.equal(result.verifiedRoutes[0]?.hub.airportCode, "CHEAP");
  assert.match(result.rejected.find((entry) => entry.airportCode === "USD")?.reason ?? "", /currencies differ/);
  assert.ok(result.verifiedRoutes[0]?.score && result.verifiedRoutes[0].score > (result.verifiedRoutes[1]?.score ?? Infinity));
});
