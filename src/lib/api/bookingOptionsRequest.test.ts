import assert from "node:assert/strict";
import test from "node:test";

import { runBookingOptionsRequest } from "./bookingOptionsRequest.ts";
import type { BookingOptionsCache } from "../cache/bookingOptionsCache.ts";
import type { BookingOptionsProvider } from "../providers/types.ts";

function bookingRequest(body: unknown): Request {
  return new Request("http://localhost/api/booking-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    bookingReference: "opaque-booking-reference",
    origin: "BNE",
    destination: "BKK",
    departureDate: "2026-08-17",
    ...overrides,
  };
}

const options = [
  {
    sellerName: "Example seller",
    price: { amount: 123, currency: "EUR" },
    flightNumbers: ["EX 1"],
  },
];

test("booking-options endpoint accepts structural IATA airport codes and defaults adults to one", async () => {
  let receivedAdults: number | undefined;
  let receivedRoute: { origin: string; destination: string } | undefined;
  const provider: BookingOptionsProvider = {
    async getBookingOptions(input) {
      receivedAdults = input.adults;
      receivedRoute = { origin: input.origin, destination: input.destination };
      return options;
    },
  };

  const result = await runBookingOptionsRequest(bookingRequest(validBody()), {
    cache: null,
    provider,
  });
  assert.deepEqual(result, { status: 200, body: { options } });
  assert.equal(receivedAdults, 1);
  assert.deepEqual(receivedRoute, { origin: "BNE", destination: "BKK" });

  const hubRouteResult = await runBookingOptionsRequest(
    bookingRequest(validBody({ origin: "BKK", destination: "LCA" })),
    { cache: null, provider }
  );
  assert.equal(hubRouteResult.status, 200);

  const lowercaseHubResult = await runBookingOptionsRequest(
    bookingRequest(validBody({ origin: "BNE", destination: "bkk" })),
    { cache: null, provider }
  );
  assert.equal(lowercaseHubResult.status, 200);
  assert.deepEqual(receivedRoute, { origin: "BNE", destination: "BKK" });

  for (const body of [
    validBody({ bookingReference: "" }),
    validBody({ origin: "BK" }),
    validBody({ origin: "BKKK" }),
    validBody({ origin: "12A" }),
    validBody({ origin: "" }),
    validBody({ destination: "BNE" }),
    validBody({ departureDate: "2026-02-30" }),
    validBody({ adults: 0 }),
  ]) {
    const invalidResult = await runBookingOptionsRequest(bookingRequest(body), {
      cache: null,
      provider,
    });
    assert.equal(invalidResult.status, 400);
  }
});

test("booking-options endpoint cache hit avoids the SearchAPI provider", async () => {
  let providerCalls = 0;
  const cache: BookingOptionsCache = {
    async get() {
      return options;
    },
    async set() {
      throw new Error("cache hit should not write");
    },
  };
  const provider: BookingOptionsProvider = {
    async getBookingOptions() {
      providerCalls += 1;
      return [];
    },
  };

  const result = await runBookingOptionsRequest(bookingRequest(validBody()), { cache, provider });
  assert.deepEqual(result, { status: 200, body: { options } });
  assert.equal(providerCalls, 0);
});

test("booking-options endpoint cache miss calls the SearchAPI provider", async () => {
  let providerCalls = 0;
  const cache: BookingOptionsCache = {
    async get() {
      return null;
    },
    async set() {},
  };
  const provider: BookingOptionsProvider = {
    async getBookingOptions() {
      providerCalls += 1;
      return options;
    },
  };

  const result = await runBookingOptionsRequest(bookingRequest(validBody({ adults: 2 })), {
    cache,
    provider,
  });
  assert.deepEqual(result, { status: 200, body: { options } });
  assert.equal(providerCalls, 1);
});

test("booking-options endpoint keeps provider errors private", async () => {
  const secret = "searchapi-private-secret";
  const provider: BookingOptionsProvider = {
    async getBookingOptions() {
      throw new Error(`Authorization: Bearer ${secret}`);
    },
  };

  const result = await runBookingOptionsRequest(bookingRequest(validBody()), {
    cache: null,
    provider,
  });
  assert.deepEqual(result, {
    status: 500,
    body: { error: "Booking options are currently unavailable. Please try again." },
  });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
});
