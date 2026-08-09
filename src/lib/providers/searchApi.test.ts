import assert from "node:assert/strict";
import test from "node:test";

import {
  createSearchApiFlightProvider,
  normalizeSearchApiError,
} from "./searchApi.ts";
import type { FlightSearchInput } from "./types.ts";

const directFlight = {
  flights: [
    {
      departure_airport: {
        id: "BNE",
        name: "Brisbane Airport",
        date: "2026-08-17",
        time: "23:30",
      },
      arrival_airport: {
        id: "BKK",
        name: "Suvarnabhumi Airport",
        date: "2026-08-18",
        time: "05:20",
      },
      duration: 410,
      airline: "Jetstar",
      flight_number: "JQ 65",
    },
  ],
  total_duration: 410,
  price: 235,
  type: "One way",
  booking_token: "not-exposed-until-booking-is-implemented",
};

const connectingFlight = {
  flights: [
    {
      departure_airport: {
        id: "BNE",
        name: "Brisbane Airport",
        date: "2026-08-17",
        time: "07:10",
      },
      arrival_airport: {
        id: "SGN",
        name: "Tan Son Nhat International Airport",
        date: "2026-08-17",
        time: "12:50",
      },
      duration: 400,
      airline: "VietJet Air",
      flight_number: "VJ 84",
    },
    {
      departure_airport: {
        id: "SGN",
        name: "Tan Son Nhat International Airport",
        date: "2026-08-17",
        time: "15:00",
      },
      arrival_airport: {
        id: "BKK",
        name: "Suvarnabhumi Airport",
        date: "2026-08-17",
        time: "16:35",
      },
      duration: 95,
      airline: "VietJet Air",
      flight_number: "VJ-801",
    },
  ],
  total_duration: 565,
  price: 180,
  type: "One way",
  booking_token: "separate-ticket-token-is-not-in-the-neutral-model",
};

const sampleInput: FlightSearchInput = {
  origin: "BNE",
  destination: "BKK",
  departureWindow: {
    start: "2026-08-17",
    end: "2026-08-17",
  },
  adults: 1,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("maps direct and connecting SearchAPI result groups into provider-neutral offers", async () => {
  let requestedUrl = "";
  let requestedAuthorization = "";
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async (input, init) => {
      requestedUrl = String(input);
      requestedAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
      return jsonResponse({
        best_flights: [directFlight],
        other_flights: [connectingFlight],
        cheapest_flights: [directFlight],
      });
    },
  });

  const offers = await provider.searchOneWay(sampleInput);

  assert.equal(offers.length, 2);
  const directOffer = offers.find((offer) => offer.stops === 0);
  const connectingOffer = offers.find((offer) => offer.stops === 1);
  assert.ok(directOffer);
  assert.ok(connectingOffer);

  assert.equal(directOffer.provider, "searchapi");
  assert.equal(directOffer.origin, "BNE");
  assert.equal(directOffer.destination, "BKK");
  assert.equal(directOffer.durationMinutes, 410);
  assert.deepEqual(directOffer.indicativePrice, { amount: 235, currency: "EUR" });
  assert.equal(directOffer.segments[0]?.airlineName, "Jetstar");
  assert.equal(directOffer.segments[0]?.airlineCode, "JQ");
  assert.equal(directOffer.segments[0]?.flightNumber, "65");
  assert.equal(directOffer.departureAt, "2026-08-17T23:30:00");
  assert.equal(directOffer.arrivalAt, "2026-08-18T05:20:00");
  assert.doesNotMatch(directOffer.departureAt, /Z$/);
  assert.equal(connectingOffer.durationMinutes, 565);
  assert.equal(connectingOffer.stops, 1);
  assert.equal(connectingOffer.segments.length, 2);
  assert.equal(connectingOffer.segments[1]?.airlineCode, "VJ");
  assert.equal(connectingOffer.segments[1]?.flightNumber, "801");

  const request = new URL(requestedUrl);
  assert.equal(request.origin + request.pathname, "https://www.searchapi.io/api/v1/search");
  assert.equal(request.searchParams.get("engine"), "google_flights");
  assert.equal(request.searchParams.get("flight_type"), "one_way");
  assert.equal(request.searchParams.get("departure_id"), "BNE");
  assert.equal(request.searchParams.get("arrival_id"), "BKK");
  assert.equal(request.searchParams.get("outbound_date"), "2026-08-17");
  assert.equal(request.searchParams.get("adults"), "1");
  assert.equal(request.searchParams.get("travel_class"), "economy");
  assert.equal(request.searchParams.get("currency"), "EUR");
  assert.equal(request.searchParams.get("show_cheapest_flights"), "true");
  assert.equal(request.searchParams.has("api_key"), false);
  assert.equal(requestedAuthorization, "Bearer searchapi_test_secret");
});

test("uses one exact-date request for every date in a flexible window", async () => {
  const requestedDates: string[] = [];
  let providerRequests = 0;
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    onRequest: () => {
      providerRequests += 1;
    },
    fetch: async (input) => {
      requestedDates.push(new URL(String(input)).searchParams.get("outbound_date") ?? "");
      return jsonResponse({ best_flights: [] });
    },
  });

  const offers = await provider.searchOneWay({
    ...sampleInput,
    departureWindow: { start: "2026-08-17", end: "2026-08-19" },
  });

  assert.deepEqual(offers, []);
  assert.deepEqual(requestedDates, ["2026-08-17", "2026-08-18", "2026-08-19"]);
  assert.equal(providerRequests, 3);
});

test("keeps the shared maximum flexible-search date protection", async () => {
  let fetchCalls = 0;
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async () => {
      fetchCalls += 1;
      return jsonResponse({ best_flights: [] });
    },
  });

  await assert.rejects(
    () =>
      provider.searchOneWay({
        ...sampleInput,
        departureWindow: { start: "2026-08-01", end: "2026-08-15" },
      }),
    /maximum of 14 days/
  );
  assert.equal(fetchCalls, 0);
});

test("missing API key fails safely before any request", async () => {
  let fetchCalls = 0;
  const provider = createSearchApiFlightProvider({
    fetch: async () => {
      fetchCalls += 1;
      return jsonResponse({ best_flights: [] });
    },
  });

  const originalApiKey = process.env.SEARCHAPI_API_KEY;
  delete process.env.SEARCHAPI_API_KEY;
  try {
    await assert.rejects(() => provider.searchOneWay(sampleInput), /SEARCHAPI_API_KEY is not configured/);
    assert.equal(fetchCalls, 0);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.SEARCHAPI_API_KEY;
    } else {
      process.env.SEARCHAPI_API_KEY = originalApiKey;
    }
  }
});

test("HTTP errors are normalized without exposing the API key", async () => {
  const apiKey = "searchapi_private_do_not_disclose";
  const provider = createSearchApiFlightProvider({
    apiKey,
    fetch: async () => jsonResponse({ error: `Authorization: Bearer ${apiKey}` }, 429),
  });

  let thrown: unknown;
  try {
    await provider.searchOneWay(sampleInput);
  } catch (error) {
    thrown = error;
  }

  const normalized = normalizeSearchApiError(thrown);
  assert.equal(normalized.status, 429);
  assert.equal(normalized.retryable, true);
  assert.match(normalized.message, /rate limit exceeded/i);
  assert.doesNotMatch(normalized.message, new RegExp(apiKey));
});

test("malformed JSON and unexpected response shapes give safe server-side errors", async () => {
  const malformedJsonProvider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async () =>
      new Response("not json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  const unexpectedShapeProvider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async () => jsonResponse({ price_insights: { lowest_price: 100 } }),
  });

  await assert.rejects(
    () => malformedJsonProvider.searchOneWay(sampleInput),
    /SearchAPI returned invalid JSON/
  );
  await assert.rejects(
    () => unexpectedShapeProvider.searchOneWay(sampleInput),
    /SearchAPI returned an unexpected response/
  );
});
