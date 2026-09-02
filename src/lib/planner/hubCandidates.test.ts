import assert from "node:assert/strict";
import test from "node:test";

import {
  deduplicateHubCandidateVariants,
  calculateHubCandidateScoreBreakdown,
  generateHubCandidates,
  selectCalendarCandidateVariants,
} from "./hubCandidates.ts";
import {
  MAX_CALENDAR_CANDIDATES,
  MAX_DEPARTURE_VARIANTS_PER_HUB,
} from "../constants/planner.ts";
import type { HubCandidate } from "./hubCandidates.ts";
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

test("exposes the exact geography-first Stage 1 score components for diagnostics", () => {
  assert.deepEqual(calculateHubCandidateScoreBreakdown(1.2, 720, 250), {
    geography: 400,
    duration: 5,
    price: 7.5,
    total: 412.5,
  });
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

function variant(
  airportCode: string,
  firstLegDepartureDate: string,
  overrides: Partial<HubCandidate> = {},
): HubCandidate {
  return {
    airportCode,
    city: airportCode,
    country: "Test country",
    firstLegDepartureDate,
    latitude: 0,
    longitude: 0,
    source: "explore",
    detourRatio: 1.1,
    originToHubDistanceKm: 1_000,
    hubToDestinationDistanceKm: 2_000,
    indicativeFirstLegPrice: 100,
    currency: "EUR",
    firstLegDurationMinutes: 240,
    candidateScore: 500,
    ...overrides,
  };
}

test("keeps distinct hub/date variants but deduplicates exact duplicates by existing quality", () => {
  const variants = deduplicateHubCandidateVariants([
    variant("IST", "2026-09-28", { candidateScore: 400 }),
    variant("IST", "2026-09-28", { candidateScore: 500 }),
    variant("IST", "2026-09-29", { candidateScore: 450 }),
  ]);

  assert.deepEqual(
    variants.map((candidate) => [candidate.airportCode, candidate.firstLegDepartureDate]),
    [["IST", "2026-09-28"], ["IST", "2026-09-29"]],
  );
  assert.equal(variants[0]?.candidateScore, 500);
});

test("uses unique hubs before second variants while retaining per-hub and global limits", () => {
  const candidates = [
    ...Array.from({ length: 4 }, (_, index) =>
      variant("IST", `2026-09-0${index + 1}`, { candidateScore: 600 - index }),
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      variant("ATH", `2026-09-0${index + 1}`, { candidateScore: 500 - index }),
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      variant(`H${index}`, "2026-09-01", { candidateScore: 400 - index }),
    ),
  ];
  const selected = selectCalendarCandidateVariants(candidates);
  const istCount = selected.filter((candidate) => candidate.airportCode === "IST").length;
  const athCount = selected.filter((candidate) => candidate.airportCode === "ATH").length;

  assert.equal(istCount, 1);
  assert.equal(athCount, 1);
  assert.equal(selected.length, MAX_CALENDAR_CANDIDATES);
  assert.equal(new Set(selected.map((candidate) => candidate.airportCode)).size, MAX_CALENDAR_CANDIDATES);
  assert.ok(istCount <= MAX_DEPARTURE_VARIANTS_PER_HUB);
  assert.ok(athCount <= MAX_DEPARTURE_VARIANTS_PER_HUB);
});

test("fills remaining Calendar slots with the strongest unused date variants", () => {
  const selected = selectCalendarCandidateVariants([
    variant("A", "2026-09-01", { candidateScore: 600 }),
    variant("A", "2026-09-02", { candidateScore: 590 }),
    variant("B", "2026-09-01", { candidateScore: 580 }),
    variant("B", "2026-09-02", { candidateScore: 570 }),
    variant("C", "2026-09-01", { candidateScore: 560 }),
    variant("C", "2026-09-02", { candidateScore: 550 }),
  ], 5);

  assert.deepEqual(
    selected.map((candidate) => `${candidate.airportCode}:${candidate.firstLegDepartureDate}`),
    ["A:2026-09-01", "B:2026-09-01", "C:2026-09-01", "A:2026-09-02", "B:2026-09-02"],
  );
});

test("preserves deterministic Stage 1 tie ordering during unique-hub selection", () => {
  const selected = selectCalendarCandidateVariants([
    variant("B", "2026-09-02", { candidateScore: 500 }),
    variant("A", "2026-09-02", { candidateScore: 500 }),
    variant("C", "2026-09-02", { candidateScore: 500 }),
  ]);
  // Existing tie-breaking uses the airport code after all equal score fields.
  assert.deepEqual(selected.map((candidate) => candidate.airportCode), ["A", "B", "C"]);
});
