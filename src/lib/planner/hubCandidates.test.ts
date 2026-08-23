import assert from "node:assert/strict";
import test from "node:test";

import { generateHubCandidates } from "./hubCandidates.ts";
import type {
  DirectDestination,
  DirectDestinationsProvider,
} from "../providers/types.ts";

function directDestination(
  airportCode: string,
  latitude: number,
  longitude: number,
  overrides: Partial<DirectDestination> = {},
): DirectDestination {
  return {
    airportCode,
    city: airportCode,
    country: "Test country",
    latitude,
    longitude,
    outboundDate: "2026-09-01",
    ...overrides,
  };
}

function providerWith(
  destinations: DirectDestination[],
): DirectDestinationsProvider {
  return { getDirectDestinations: async () => destinations };
}

test("near-route hubs have lower detour ratios than backwards detours", async () => {
  const candidates = await generateHubCandidates(
    { origin: "LCA", destination: "DPS", departureDate: "2026-09-01" },
    providerWith([
      directDestination("DXB", 25.2532, 55.3657),
      directDestination("LHR", 51.47, -0.46),
    ]),
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.airportCode, "DXB");
  assert.ok(candidates[0]?.detourRatio && candidates[0].detourRatio < 1.6);
});

test("filters candidates above the configured detour threshold", async () => {
  const candidates = await generateHubCandidates(
    { origin: "LCA", destination: "DPS", departureDate: "2026-09-01" },
    providerWith([
      directDestination("DXB", 25.2532, 55.3657),
      directDestination("LHR", 51.47, -0.46),
    ]),
  );

  assert.deepEqual(candidates.map((candidate) => candidate.airportCode), ["DXB"]);
});

test("ranks lower-detour hubs above extreme detours and removes endpoints", async () => {
  const candidates = await generateHubCandidates(
    { origin: "LCA", destination: "DPS", departureDate: "2026-09-01" },
    providerWith([
      directDestination("LCA", 34.8751, 33.6249),
      directDestination("DPS", -8.7484, 115.1671),
      directDestination("DXB", 25.2532, 55.3657, {
        indicativePrice: 300,
        flightDurationMinutes: 240,
      }),
      directDestination("NQZ", 51.0222, 71.4669, {
        indicativePrice: 100,
        flightDurationMinutes: 330,
      }),
      directDestination("LHR", 51.47, -0.46),
    ]),
  );

  assert.deepEqual(candidates.map((candidate) => candidate.airportCode), ["DXB", "NQZ"]);
  assert.ok((candidates[0]?.detourRatio ?? Infinity) < (candidates[1]?.detourRatio ?? 0));
});
