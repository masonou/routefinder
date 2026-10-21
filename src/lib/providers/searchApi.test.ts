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
      requestedAuthorization =
        new Headers(init?.headers).get("Authorization") ?? "";
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
  assert.deepEqual(directOffer.indicativePrice, {
    amount: 235,
    currency: "EUR",
  });
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
  assert.equal(
    request.origin + request.pathname,
    "https://www.searchapi.io/api/v1/search",
  );
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
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async (input) => {
      requestedDates.push(
        new URL(String(input)).searchParams.get("outbound_date") ?? "",
      );
      return jsonResponse({ best_flights: [] });
    },
  });

  const offers = await provider.searchOneWay({
    ...sampleInput,
    departureWindow: { start: "2026-08-17", end: "2026-08-19" },
  });

  assert.deepEqual(offers, []);
  assert.deepEqual(requestedDates, ["2026-08-17", "2026-08-18", "2026-08-19"]);
});

test("detailed diagnostics preserve the broad request and parser rejection evidence", async () => {
  let trace: Parameters<NonNullable<import("./searchApi.ts").SearchApiDiagnosticHooks["onDetailedTrace"]>>[0] | undefined;
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    diagnostics: { onDetailedTrace: (entry) => { trace = entry; } },
    fetch: async () => jsonResponse({
      best_flights: [directFlight, { flights: [] }],
      hidden_flights: [connectingFlight],
    }),
  });

  await provider.searchOneWay(sampleInput);

  assert.equal(trace?.request.stops, undefined);
  assert.equal(trace?.rawGroupCounts.best_flights, 2);
  assert.equal(trace?.rawGroupCounts.hidden_flights, 1);
  assert.equal(trace?.rawFlightResults, 3);
  assert.equal(trace?.mappedOffers.length, 2);
  assert.equal(trace?.parserRejections.invalid_or_incomplete_segment, 1);
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
    /maximum of 14 days/,
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
    await assert.rejects(
      () => provider.searchOneWay(sampleInput),
      /SEARCHAPI_API_KEY is not configured/,
    );
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
    fetch: async () =>
      jsonResponse({ error: `Authorization: Bearer ${apiKey}` }, 429),
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
    /SearchAPI returned invalid JSON/,
  );
  await assert.rejects(
    () => unexpectedShapeProvider.searchOneWay(sampleInput),
    /SearchAPI returned an unexpected response/,
  );
});

test("maps only nonstop Explore destinations and safely skips malformed entries", async () => {
  let requestedUrl = "";
  let requestedAuthorization = "";
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async (input, init) => {
      requestedUrl = String(input);
      requestedAuthorization =
        new Headers(init?.headers).get("Authorization") ?? "";
      return jsonResponse({
        destinations: [
          {
            name: "Dubai",
            country: "United Arab Emirates",
            coordinates: [25.2048, 55.2708],
            outbound_date: "2026-09-01",
            flight: {
              airport_code: "dxb",
              stops: 0,
              price: 241,
              flight_duration_minutes: 225,
              airline_code: "ek",
              airline_name: "Emirates",
            },
          },
          {
            name: "Malformed",
            country: "Test",
            coordinates: [91, 0],
            outbound_date: "2026-09-01",
            flight: { airport_code: "BAD", stops: 0 },
          },
          {
            name: "Not direct",
            country: "Test",
            coordinates: [40, 20],
            outbound_date: "2026-09-01",
            flight: { airport_code: "CON", stops: 1 },
          },
          {
            name: "Dubai duplicate",
            country: "United Arab Emirates",
            coordinates: [25.2048, 55.2708],
            outbound_date: "2026-09-01",
            flight: { airport_code: "DXB", stops: 0, price: 300 },
          },
        ],
      });
    },
  });

  const destinations = await provider.getDirectDestinations({
    origin: "lca",
    departureDate: "2026-09-01",
  });

  assert.deepEqual(destinations, [
    {
      airportCode: "DXB",
      city: "Dubai",
      country: "United Arab Emirates",
      latitude: 25.2048,
      longitude: 55.2708,
      outboundDate: "2026-09-01",
      indicativePrice: 241,
      currency: "EUR",
      flightDurationMinutes: 225,
      airlineCode: "EK",
      airlineName: "Emirates",
    },
  ]);

  const request = new URL(requestedUrl);
  assert.equal(request.searchParams.get("engine"), "google_travel_explore");
  assert.equal(request.searchParams.get("departure_id"), "LCA");
  assert.equal(request.searchParams.get("time_period"), "2026-09-01");
  assert.equal(request.searchParams.get("travel_mode"), "flights_only");
  assert.equal(request.searchParams.get("stops"), "nonstop");
  assert.equal(request.searchParams.get("currency"), "EUR");
  assert.equal(request.searchParams.has("api_key"), false);
  assert.equal(requestedAuthorization, "Bearer searchapi_test_secret");
});

test("retries one transient Explore timeout once and records the retry", async () => {
  let calls = 0;
  const timings: Array<{ retryAttempt: number }> = [];
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    timeoutMs: 10,
    diagnostics: { onRequestTiming: (timing) => timings.push(timing) },
    fetch: async () => {
      calls += 1;
      if (calls === 1) throw new DOMException("timeout", "AbortError");
      return jsonResponse({ destinations: [] });
    },
  });
  assert.deepEqual(await provider.getDirectDestinations({ origin: "MGC", departureDate: "2027-02-10" }), []);
  assert.equal(calls, 2);
  assert.deepEqual(timings.map((timing) => timing.retryAttempt), [0, 1]);
});

test("an Explore timeout after its retry remains a provider failure", async () => {
  let calls = 0;
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async () => {
      calls += 1;
      throw new DOMException("timeout", "AbortError");
    },
  });
  await assert.rejects(
    () => provider.getDirectDestinations({ origin: "MGC", departureDate: "2027-02-10" }),
    /timed out/,
  );
  assert.equal(calls, 2);
});

test("does not retry non-retryable Explore schema failures", async () => {
  let calls = 0;
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async () => {
      calls += 1;
      return jsonResponse({ unexpected: true });
    },
  });
  await assert.rejects(
    () => provider.getDirectDestinations({ origin: "MGC", departureDate: "2027-02-10" }),
    /unexpected response/,
  );
  assert.equal(calls, 1);
});

test("recognizes valid empty Explore responses but preserves malformed destination payloads", async () => {
  let trace: import("./searchApi.ts").SearchApiExploreTrace | undefined;
  const emptyProvider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    diagnostics: { onExploreTrace: (entry) => { trace = entry; } },
    fetch: async () => jsonResponse({
      search_metadata: { status: "Success" },
      search_parameters: { engine: "google_travel_explore", departure_id: "MGC" },
      error: "Google Travel Explore API didn't return any results.",
    }),
  });
  assert.deepEqual(await emptyProvider.getDirectDestinations({ origin: "MGC", departureDate: "2027-02-10" }), []);
  assert.deepEqual(trace && {
    outcome: trace.outcome,
    destinations: trace.destinations,
    rawDestinations: trace.rawDestinations,
    metadataStatus: trace.metadataStatus,
    searchParametersKeys: trace.searchParametersKeys,
  }, {
    outcome: "empty",
    destinations: "missing",
    rawDestinations: 0,
    metadataStatus: "Success",
    searchParametersKeys: ["departure_id", "engine"],
  });
  const malformedProvider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async () => jsonResponse({ destinations: [{ flight: { stops: 0 } }] }),
  });
  await assert.rejects(
    () => malformedProvider.getDirectDestinations({ origin: "MGC", departureDate: "2027-02-10" }),
    /without usable flight data/,
  );
});

test("recognizes a successful detailed no-results marker as an empty flight list", async () => {
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async () => jsonResponse({
      search_metadata: { status: "Success" },
      search_parameters: { engine: "google_flights" },
      error: "Google Flights API didn't return any results.",
    }),
  });
  assert.deepEqual(await provider.searchOneWay(sampleInput), []);
});

test("maps one-way Calendar dates without leaking raw SearchAPI entries", async () => {
  let requestedUrl = "";
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async (input) => {
      requestedUrl = String(input);
      return jsonResponse({
        calendar: [
          { departure: "2026-09-03", price: 210 },
          { departure: "2026-09-04", has_no_flights: true },
          { departure: "2026-09-05" },
          { departure: "not-a-date", price: 99 },
          null,
        ],
      });
    },
  });

  const calendar = await provider.getFlightCalendar({
    origin: "dxb",
    destination: "dps",
    departureWindow: { start: "2026-09-03", end: "2026-09-07" },
  });

  assert.deepEqual(calendar, [
    { departureDate: "2026-09-03", price: 210, currency: "EUR", hasFlights: true },
    { departureDate: "2026-09-04", currency: "EUR", hasFlights: false },
    { departureDate: "2026-09-05", currency: "EUR", hasFlights: true },
  ]);

  const request = new URL(requestedUrl);
  assert.equal(request.searchParams.get("engine"), "google_flights_calendar");
  assert.equal(request.searchParams.get("flight_type"), "one_way");
  assert.equal(request.searchParams.get("departure_id"), "DXB");
  assert.equal(request.searchParams.get("arrival_id"), "DPS");
  assert.equal(request.searchParams.get("outbound_date"), "2026-09-03");
  assert.equal(request.searchParams.get("outbound_date_start"), "2026-09-03");
  assert.equal(request.searchParams.get("outbound_date_end"), "2026-09-07");
  assert.equal(request.searchParams.get("stops"), "two_stops_or_fewer");
  assert.equal(request.searchParams.get("currency"), "EUR");
});

test("Calendar accepts a caller-selected nonstop policy", async () => {
  let requestedUrl = "";
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async (input) => {
      requestedUrl = String(input);
      return jsonResponse({ calendar: [] });
    },
  });

  await provider.getFlightCalendar({
    origin: "ATH",
    destination: "SIN",
    departureWindow: { start: "2026-09-20", end: "2026-09-23" },
    stopPolicy: "nonstop",
  });

  const request = new URL(requestedUrl);
  assert.equal(request.searchParams.get("engine"), "google_flights_calendar");
  assert.equal(request.searchParams.get("flight_type"), "one_way");
  assert.equal(request.searchParams.get("departure_id"), "ATH");
  assert.equal(request.searchParams.get("arrival_id"), "SIN");
  assert.equal(request.searchParams.get("outbound_date"), "2026-09-20");
  assert.equal(request.searchParams.get("outbound_date_start"), "2026-09-20");
  assert.equal(request.searchParams.get("outbound_date_end"), "2026-09-23");
  assert.equal(request.searchParams.get("stops"), "nonstop");
  assert.equal(request.searchParams.get("currency"), "EUR");
});

test("Calendar provider errors surface safely", async () => {
  const provider = createSearchApiFlightProvider({
    apiKey: "searchapi_test_secret",
    fetch: async () => jsonResponse({ error: "unavailable" }, 503),
  });

  await assert.rejects(
    () =>
      provider.getFlightCalendar({
        origin: "DXB",
        destination: "DPS",
        departureWindow: { start: "2026-09-03", end: "2026-09-07" },
      }),
    /service is unavailable/,
  );
});
