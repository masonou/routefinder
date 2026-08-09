import assert from "node:assert/strict";
import test from "node:test";

import { runSearchApiPlannerExample } from "./searchApiPlannerExample.ts";
import { SearchApiFlightProvider } from "../providers/searchApi.ts";
import type { FlightProvider } from "../providers/types.ts";
import type { FlightOffer } from "../../types/flight.ts";
import type { Itinerary } from "../../types/itinerary.ts";
import type { TripRequest } from "../../types/trip.ts";

const firstLeg: FlightOffer = {
  id: "searchapi:first",
  provider: "searchapi",
  origin: "BNE",
  destination: "BKK",
  departureAt: "2026-08-17T10:00:00",
  arrivalAt: "2026-08-17T16:00:00",
  durationMinutes: 360,
  stops: 0,
  segments: [
    {
      origin: "BNE",
      destination: "BKK",
      departureAt: "2026-08-17T10:00:00",
      arrivalAt: "2026-08-17T16:00:00",
      airlineName: "Test Air",
    },
  ],
  indicativePrice: { amount: 200, currency: "EUR" },
};

const secondLeg: FlightOffer = {
  id: "searchapi:second",
  provider: "searchapi",
  origin: "BKK",
  destination: "LCA",
  departureAt: "2026-08-21T10:00:00",
  arrivalAt: "2026-08-21T17:00:00",
  durationMinutes: 420,
  stops: 0,
  segments: [
    {
      origin: "BKK",
      destination: "LCA",
      departureAt: "2026-08-21T10:00:00",
      arrivalAt: "2026-08-21T17:00:00",
      airlineName: "Test Air",
    },
  ],
  indicativePrice: { amount: 300, currency: "EUR" },
};

const itinerary: Itinerary = {
  id: "searchapi:first__searchapi:second",
  origin: "BNE",
  hub: "BKK",
  destination: "LCA",
  firstLeg,
  secondLeg,
  hubStayNights: 4,
  totalPrice: { amount: 500, currency: "EUR" },
  totalFlightDurationMinutes: 780,
  totalStops: 0,
  score: 123,
};

function requireBody(
  result: Awaited<ReturnType<typeof runSearchApiPlannerExample>>
) {
  if (!("body" in result)) {
    throw new Error("Expected a response body.");
  }

  return result.body;
}

test("planner example derives the production D through D+3 window and uses SearchAPI", async () => {
  let receivedRequest: TripRequest | undefined;
  let receivedProvider: FlightProvider | undefined;
  const result = await runSearchApiPlannerExample(
    new Request(
      "http://localhost/api/searchapi-planner-example?origin=BNE&destination=LCA&earliestDeparture=2026-08-17&adults=1"
    ),
    {
      nodeEnvironment: "test",
      async planTrip(request, provider) {
        receivedRequest = request;
        receivedProvider = provider;
        return [itinerary];
      },
    }
  );

  const body = requireBody(result);
  assert.equal(result.status, 200);
  assert.ok(receivedProvider instanceof SearchApiFlightProvider);
  assert.deepEqual(receivedRequest?.departureWindow, {
    start: "2026-08-17",
    end: "2026-08-20",
  });
  assert.equal("arrivalWindow" in (receivedRequest ?? {}), false);
  assert.deepEqual(body, {
    provider: "searchapi",
    request: {
      origin: "BNE",
      destination: "LCA",
      earliestDeparture: "2026-08-17",
      departureWindow: { start: "2026-08-17", end: "2026-08-20" },
      adults: 1,
    },
    count: 1,
    itineraries: [itinerary],
    diagnostics: { providerRequests: 0 },
  });
});

test("planner example reports provider request instrumentation without real API calls", async () => {
  let providerSearches = 0;
  const result = await runSearchApiPlannerExample(
    new Request("http://localhost/api/searchapi-planner-example?earliestDeparture=2026-08-17"),
    {
      nodeEnvironment: "test",
      createProvider(onRequest) {
        return {
          name: "searchapi",
          async searchOneWay() {
            providerSearches += 1;
            onRequest();
            return [];
          },
        };
      },
      async planTrip(_request, provider) {
        await provider.searchOneWay({
          origin: "BNE",
          destination: "BKK",
          departureWindow: { start: "2026-08-17", end: "2026-08-20" },
          adults: 1,
        });
        return [];
      },
    }
  );

  const body = requireBody(result);
  assert.equal(result.status, 200);
  assert.equal(providerSearches, 1);
  if (!("diagnostics" in body)) {
    throw new Error("Expected successful diagnostic metadata.");
  }
  assert.deepEqual(body.diagnostics, { providerRequests: 1 });
});

test("production planner example endpoint is unavailable before planner execution", async () => {
  let plannerCalls = 0;
  const result = await runSearchApiPlannerExample(
    new Request("http://localhost/api/searchapi-planner-example"),
    {
      nodeEnvironment: "production",
      async planTrip() {
        plannerCalls += 1;
        return [];
      },
    }
  );

  assert.deepEqual(result, { status: 404 });
  assert.equal(plannerCalls, 0);
});

test("planner example errors redact SearchAPI credentials", async () => {
  const secret = "searchapi_private_do_not_disclose";
  const result = await runSearchApiPlannerExample(
    new Request("http://localhost/api/searchapi-planner-example?earliestDeparture=2026-08-17"),
    {
      nodeEnvironment: "test",
      async planTrip() {
        throw new Error(`Search failed with Authorization: Bearer ${secret}`);
      },
    }
  );

  const body = requireBody(result);
  assert.equal(result.status, 500);
  if (!("error" in body)) {
    throw new Error("Expected an error response.");
  }
  assert.doesNotMatch(body.error, new RegExp(secret));
  assert.match(body.error, /Authorization: \[REDACTED\]/);
});
