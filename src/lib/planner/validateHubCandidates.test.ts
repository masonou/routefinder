import assert from "node:assert/strict";
import test from "node:test";

import {
  CALENDAR_VALIDATION_CONCURRENCY,
  MAX_CALENDAR_CANDIDATES,
} from "../constants/planner.ts";
import type {
  FlightCalendarDay,
  FlightCalendarProvider,
} from "../providers/types.ts";
import type { HubCandidate } from "./hubCandidates.ts";
import { validateHubCandidates } from "./validateHubCandidates.ts";

function candidate(
  airportCode: string,
  overrides: Partial<HubCandidate> = {},
): HubCandidate {
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
    firstLegDurationMinutes: 240,
    candidateScore: 500,
    ...overrides,
  };
}

function calendarProvider(
  calendars: Record<string, FlightCalendarDay[]>,
): FlightCalendarProvider {
  return {
    async getFlightCalendar(input) {
      return calendars[input.origin] ?? [];
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

test("selects a mildly more expensive four-night onward option", async () => {
  const result = await validateHubCandidates(
    { candidates: [candidate("DXB")], destination: "DPS" },
    calendarProvider({
      DXB: [
        { departureDate: "2026-09-04", price: 119, currency: "EUR", hasFlights: true },
        { departureDate: "2026-09-05", price: 120, currency: "EUR", hasFlights: true },
      ],
    }),
    { cache: null },
  );

  const [validated] = result.validatedCandidates;
  assert.equal(validated?.bestOnwardDate, "2026-09-05");
  assert.equal(validated?.bestStayNights, 4);
  assert.equal(validated?.estimatedTotalPrice, 220);
  assert.equal(validated?.onwardPolicy, "nonstop");
});

test("uses no fallback Calendar calls once three clean hubs survive", async () => {
  const policies: string[] = [];
  const result = await validateHubCandidates(
    { candidates: [candidate("AAA"), candidate("BBB"), candidate("CCC")], destination: "DPS" },
    {
      async getFlightCalendar(input) {
        policies.push(input.stopPolicy ?? "");
        return [{ departureDate: "2026-09-05", price: 100, currency: "EUR", hasFlights: true }];
      },
    },
    { cache: null },
  );

  assert.deepEqual(policies, ["nonstop", "nonstop", "nonstop"]);
  assert.equal(result.cleanHubCount, 3);
  assert.equal(result.fallbackCalendarChecks, 0);
});

test("uses connecting Calendar searches only to fill clean-hub gaps and caps them", async () => {
  const calls: Array<{ origin: string; policy: string | undefined }> = [];
  const candidates = Array.from({ length: MAX_CALENDAR_CANDIDATES }, (_, index) =>
    candidate(`H${index}`),
  );
  const result = await validateHubCandidates(
    { candidates, destination: "DPS" },
    {
      async getFlightCalendar(input) {
        calls.push({ origin: input.origin, policy: input.stopPolicy });
        if (input.stopPolicy === "nonstop") return [];
        return [{ departureDate: "2026-09-05", price: 100, currency: "EUR", hasFlights: true }];
      },
    },
    { cache: null, mode: "both" },
  );

  assert.equal(result.nonstopCalendarChecks, MAX_CALENDAR_CANDIDATES);
  assert.equal(result.cleanHubCount, 0);
  assert.equal(result.fallbackCalendarChecks, 4);
  assert.equal(calls.filter((call) => call.policy === "two_stops_or_fewer").length, 4);
  assert.ok(result.validatedCandidates.every((entry) => entry.onwardPolicy === "connecting_fallback"));
});

test("uses fallback only for non-clean hubs when two clean hubs survive", async () => {
  const calls: Array<{ origin: string; policy: string | undefined }> = [];
  const result = await validateHubCandidates(
    { candidates: [candidate("AAA"), candidate("BBB"), candidate("CCC")], destination: "DPS" },
    {
      async getFlightCalendar(input) {
        calls.push({ origin: input.origin, policy: input.stopPolicy });
        const clean = input.origin === "AAA" || input.origin === "BBB";
        if (input.stopPolicy === "nonstop") {
          return clean
            ? [{ departureDate: "2026-09-05", price: 100, currency: "EUR", hasFlights: true }]
            : [];
        }
        return [{ departureDate: "2026-09-05", price: 100, currency: "EUR", hasFlights: true }];
      },
    },
    { cache: null, mode: "both" },
  );

  assert.equal(result.cleanHubCount, 2);
  assert.equal(result.fallbackCalendarChecks, 1);
  assert.deepEqual(
    calls.filter((call) => call.policy === "two_stops_or_fewer").map((call) => call.origin),
    ["CCC"],
  );
  assert.deepEqual(result.topCandidates.map((entry) => entry.onwardPolicy), [
    "nonstop",
    "nonstop",
    "connecting_fallback",
  ]);
});

test("allows a substantially cheaper non-target stay and rejects unpriced or unavailable dates", async () => {
  const result = await validateHubCandidates(
    { candidates: [candidate("NQZ")], destination: "DPS" },
    calendarProvider({
      NQZ: [
        { departureDate: "2026-09-03", price: 90, currency: "EUR", hasFlights: true },
        { departureDate: "2026-09-05", price: 120, currency: "EUR", hasFlights: true },
        { departureDate: "2026-09-06", currency: "EUR", hasFlights: true },
        { departureDate: "2026-09-07", currency: "EUR", hasFlights: false },
        { departureDate: "2026-09-08", price: 1, currency: "EUR", hasFlights: true },
      ],
    }),
    { cache: null },
  );

  const [validated] = result.validatedCandidates;
  assert.equal(validated?.bestOnwardDate, "2026-09-03");
  assert.equal(validated?.bestStayNights, 2);
  assert.deepEqual(
    validated?.onwardOptions.map((option) => option.departureDate),
    ["2026-09-03", "2026-09-05"],
  );
});

test("no viable Calendar dates rejects the candidate without representing it as an API failure", async () => {
  const result = await validateHubCandidates(
    { candidates: [candidate("ATH")], destination: "DPS" },
    calendarProvider({
      ATH: [{ departureDate: "2026-09-04", currency: "EUR", hasFlights: false }],
    }),
    { cache: null },
  );

  assert.deepEqual(result.validatedCandidates, []);
  assert.deepEqual(result.rejectedNoViableDates, ["ATH"]);
  assert.deepEqual(result.failures, []);
});

test("limits Calendar lookups and ranks validated hubs using price, detour, and stay fit", async () => {
  const candidates = Array.from({ length: MAX_CALENDAR_CANDIDATES + 2 }, (_, index) =>
    candidate(`H${String(index).padStart(2, "0")}`, {
      detourRatio: index === 1 ? 1.0 : 1.2,
      indicativeFirstLegPrice: index === 0 ? 100 : 300,
      candidateScore: index === 1 ? 600 : 400,
    }),
  );
  let providerCalls = 0;
  const provider: FlightCalendarProvider = {
    async getFlightCalendar(input) {
      providerCalls += 1;
      return [
        {
          departureDate: "2026-09-05",
          price: input.origin === "H00" ? 100 : 120,
          currency: "EUR",
          hasFlights: true,
        },
      ];
    },
  };

  const result = await validateHubCandidates(
    { candidates, destination: "DPS" },
    provider,
    { cache: null },
  );

  assert.equal(providerCalls, MAX_CALENDAR_CANDIDATES);
  assert.equal(result.topCandidates.length, 3);
  assert.equal(result.validatedCandidates[0]?.airportCode, "H00");
});

test("Calendar validation starts four requests and holds the fifth until a pool slot opens", async () => {
  const candidates = Array.from({ length: CALENDAR_VALIDATION_CONCURRENCY + 1 }, (_, index) =>
    candidate(`Q${index}`),
  );
  const started: string[] = [];
  const firstWaveStarted = deferred<void>();
  const fifthStarted = deferred<void>();
  const gates = new Map(candidates.map((entry) => [entry.airportCode, deferred<void>()]));
  const resultPromise = validateHubCandidates(
    { candidates, destination: "DPS" },
    {
      async getFlightCalendar(input) {
        started.push(input.origin);
        if (started.length === CALENDAR_VALIDATION_CONCURRENCY) firstWaveStarted.resolve();
        if (started.length === CALENDAR_VALIDATION_CONCURRENCY + 1) fifthStarted.resolve();
        await gates.get(input.origin)?.promise;
        return [{ departureDate: "2026-09-05", price: 100, currency: "EUR", hasFlights: true }];
      },
    },
    { cache: null },
  );

  await firstWaveStarted.promise;
  assert.equal(started.length, CALENDAR_VALIDATION_CONCURRENCY);
  gates.get(candidates[0]!.airportCode)?.resolve();
  await fifthStarted.promise;
  assert.equal(started.length, CALENDAR_VALIDATION_CONCURRENCY + 1);
  candidates.slice(1).forEach((entry) => gates.get(entry.airportCode)?.resolve());
  const result = await resultPromise;
  assert.equal(result.concurrency.maxInFlight, CALENDAR_VALIDATION_CONCURRENCY);
});

test("partial Calendar provider failures remain distinct from no-flight rejections", async () => {
  const warnings: string[] = [];
  const provider: FlightCalendarProvider = {
    async getFlightCalendar(input) {
      if (input.origin === "BAD") {
        throw new Error("upstream unavailable");
      }
      return [
        { departureDate: "2026-09-05", price: 150, currency: "EUR", hasFlights: true },
      ];
    },
  };

  const result = await validateHubCandidates(
    { candidates: [candidate("GOOD"), candidate("BAD")], destination: "DPS" },
    provider,
    { cache: null, warn: (message) => warnings.push(message) },
  );

  assert.deepEqual(result.validatedCandidates.map((entry) => entry.airportCode), ["GOOD"]);
  assert.deepEqual(result.rejectedNoViableDates, []);
  assert.deepEqual(result.failures, [
    { airportCode: "BAD", message: "upstream unavailable" },
  ]);
  assert.match(warnings[0] ?? "", /Calendar validation failed for BAD/);
});

test("each first-leg variant validates its own two-to-six-night Calendar window", async () => {
  const windows: Array<{ start: string; end: string }> = [];
  const result = await validateHubCandidates(
    {
      candidates: [
        candidate("IST", { firstLegDepartureDate: "2026-09-28" }),
        candidate("IST", { firstLegDepartureDate: "2026-09-29" }),
      ],
      destination: "DPS",
    },
    {
      async getFlightCalendar(input) {
        windows.push(input.departureWindow);
        return [{
          departureDate: input.departureWindow.start,
          price: 100,
          currency: "EUR",
          hasFlights: true,
        }];
      },
    },
    { cache: null },
  );

  assert.deepEqual(windows, [
    { start: "2026-09-30", end: "2026-10-04" },
    { start: "2026-10-01", end: "2026-10-05" },
  ]);
  assert.equal(result.validatedCandidates.length, 1);
});

test("collapses multiple valid date variants to the strongest variant for each hub", async () => {
  const result = await validateHubCandidates(
    {
      candidates: [
        candidate("IST", { firstLegDepartureDate: "2026-09-01" }),
        candidate("IST", { firstLegDepartureDate: "2026-09-02" }),
        candidate("ATH", { firstLegDepartureDate: "2026-09-01" }),
      ],
      destination: "DPS",
    },
    {
      async getFlightCalendar(input) {
        const price =
          input.origin === "IST" && input.departureWindow.start === "2026-09-03"
            ? 400
            : input.origin === "IST"
              ? 100
              : 150;
        return [{
          departureDate: input.departureWindow.start,
          price,
          currency: "EUR",
          hasFlights: true,
        }];
      },
    },
    { cache: null },
  );

  assert.deepEqual(
    result.validatedCandidates.map((entry) => entry.airportCode).sort(),
    ["ATH", "IST"],
  );
  assert.equal(
    result.validatedCandidates.find((entry) => entry.airportCode === "IST")
      ?.firstLegDepartureDate,
    "2026-09-02",
  );
  assert.equal(new Set(result.topCandidates.map((entry) => entry.airportCode)).size, result.topCandidates.length);
});
