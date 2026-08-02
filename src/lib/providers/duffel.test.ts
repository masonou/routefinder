import assert from "node:assert/strict";
import test from "node:test";

import {
  createDuffelFlightProvider,
  normalizeDuffelError,
} from "./duffel.ts";
import type { FlightOffer } from "../../types/flight.ts";
import type { FlightSearchInput } from "./types.ts";

function createOffer(id: string, departureAt: string): FlightOffer {
  const arrivalAt = `${departureAt.slice(0, 11)}14:00:00`;

  return {
    id,
    provider: "duffel",
    origin: "BNE",
    destination: "BKK",
    departureAt,
    arrivalAt,
    durationMinutes: 360,
    stops: 0,
    segments: [
      {
        origin: "BNE",
        destination: "BKK",
        departureAt,
        arrivalAt,
        airlineName: "Test Air",
        airlineCode: "TA",
        flightNumber: "TA100",
      },
    ],
    indicativePrice: {
      amount: 100,
      currency: "EUR",
    },
  };
}

function createDuffelStructuredError(
  status: number,
  overrides: Partial<{
    message: string;
    title: string;
    code: string;
    type: string;
    requestId: string;
  }> = {}
) {
  return {
    errors: [
      {
        type: overrides.type ?? "api_error",
        title: overrides.title ?? "Duffel API error",
        message: overrides.message ?? "Temporary Duffel failure",
        code: overrides.code ?? "temporary_failure",
      },
    ],
    meta: {
      status,
      request_id: overrides.requestId ?? "req_test_123",
    },
  };
}

const sampleInput: FlightSearchInput = {
  origin: "BNE",
  destination: "BKK",
  departureWindow: {
    start: "2026-09-09",
    end: "2026-09-11",
  },
  adults: 1,
};

const noDelay = async () => {};

test("structured Duffel errors produce a non-empty message and preserve details", () => {
  const normalized = normalizeDuffelError(
    createDuffelStructuredError(429, {
      message: "",
      title: "Too many requests hit the API too quickly.",
      code: "rate_limit_exceeded",
      requestId: "req_live_123",
    })
  );

  assert.equal(normalized.status, 429);
  assert.equal(normalized.code, "rate_limit_exceeded");
  assert.equal(normalized.requestId, "req_live_123");
  assert.equal(normalized.retryable, true);
  assert.match(normalized.message, /Too many requests hit the API too quickly\./);
  assert.match(normalized.message, /status=429/);
  assert.match(normalized.message, /code=rate_limit_exceeded/);
  assert.match(normalized.message, /requestId=req_live_123/);
});

test("retryable failures are retried and can succeed on the second attempt", async () => {
  let attempts = 0;
  const provider = createDuffelFlightProvider({
    delay: noDelay,
    warn: () => {},
    isDevelopment: true,
    async searchExactDate(_input, departureDate) {
      attempts += 1;

      if (attempts === 1) {
        throw createDuffelStructuredError(503, {
          message: "Service temporarily unavailable",
          code: "service_unavailable",
        });
      }

      return [createOffer(`offer-${departureDate}`, `${departureDate}T08:00:00`)];
    },
  });

  const offers = await provider.searchOneWay({
    ...sampleInput,
    departureWindow: {
      start: "2026-09-09",
      end: "2026-09-09",
    },
  });

  assert.equal(attempts, 2);
  assert.equal(offers.length, 1);
});

test("retries stop after the configured maximum", async () => {
  let attempts = 0;
  const provider = createDuffelFlightProvider({
    delay: noDelay,
    warn: () => {},
    isDevelopment: true,
    async searchExactDate() {
      attempts += 1;
      throw createDuffelStructuredError(503, {
        message: "Service temporarily unavailable",
        code: "service_unavailable",
      });
    },
  });

  await assert.rejects(
    () =>
      provider.searchOneWay({
        ...sampleInput,
        departureWindow: {
          start: "2026-09-09",
          end: "2026-09-09",
        },
      }),
    /across 1 dates/
  );

  assert.equal(attempts, 3);
});

test("one failed date does not remove offers from successful dates", async () => {
  const warnings: string[] = [];
  const attemptsByDate = new Map<string, number>();
  const provider = createDuffelFlightProvider({
    delay: noDelay,
    warn: (message) => warnings.push(message),
    isDevelopment: true,
    async searchExactDate(_input, departureDate) {
      attemptsByDate.set(
        departureDate,
        (attemptsByDate.get(departureDate) ?? 0) + 1
      );

      if (departureDate === "2026-09-10") {
        throw createDuffelStructuredError(504, {
          message: "Gateway timeout",
          code: "gateway_timeout",
          requestId: "req_skip_2026_09_10",
        });
      }

      return [createOffer(`offer-${departureDate}`, `${departureDate}T08:00:00`)];
    },
  });

  const offers = await provider.searchOneWay(sampleInput);

  assert.deepEqual(
    offers.map((offer) => offer.id),
    ["offer-2026-09-09", "offer-2026-09-11"]
  );
  assert.equal(attemptsByDate.get("2026-09-10"), 3);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Duffel search skipped BNE → BKK on 2026-09-10/);
});

test("all retryable failed dates produce a meaningful combined error", async () => {
  const provider = createDuffelFlightProvider({
    delay: noDelay,
    warn: () => {},
    isDevelopment: true,
    async searchExactDate() {
      throw createDuffelStructuredError(429, {
        message: "Too many requests hit the API too quickly.",
        code: "rate_limit_exceeded",
        requestId: "req_rate_123",
      });
    },
  });

  await assert.rejects(
    () => provider.searchOneWay(sampleInput),
    /across 3 dates .*Too many requests hit the API too quickly\./
  );
});

test("a 401 error fails immediately without retries", async () => {
  let attempts = 0;
  const provider = createDuffelFlightProvider({
    delay: noDelay,
    warn: () => {},
    isDevelopment: true,
    async searchExactDate() {
      attempts += 1;
      throw createDuffelStructuredError(401, {
        message: "Access token is invalid",
        code: "authentication_failed",
        requestId: "req_auth_401",
      });
    },
  });

  await assert.rejects(
    () =>
      provider.searchOneWay({
        ...sampleInput,
        departureWindow: {
          start: "2026-09-09",
          end: "2026-09-09",
        },
      }),
    /on 2026-09-09: Access token is invalid/
  );

  assert.equal(attempts, 1);
});

test("a 422 error fails immediately without retries", async () => {
  let attempts = 0;
  const provider = createDuffelFlightProvider({
    delay: noDelay,
    warn: () => {},
    isDevelopment: true,
    async searchExactDate() {
      attempts += 1;
      throw createDuffelStructuredError(422, {
        message: "Departure date is invalid",
        code: "validation_error",
      });
    },
  });

  await assert.rejects(
    () =>
      provider.searchOneWay({
        ...sampleInput,
        departureWindow: {
          start: "2026-09-09",
          end: "2026-09-09",
        },
      }),
    /Departure date is invalid/
  );

  assert.equal(attempts, 1);
});

test("duplicate offer IDs are still removed", async () => {
  const provider = createDuffelFlightProvider({
    delay: noDelay,
    warn: () => {},
    isDevelopment: true,
    async searchExactDate(_input, departureDate) {
      return [
        createOffer("shared-offer", `${departureDate}T08:00:00`),
        createOffer(`unique-${departureDate}`, `${departureDate}T09:00:00`),
      ];
    },
  });

  const offers = await provider.searchOneWay(sampleInput);

  assert.deepEqual(
    offers.map((offer) => offer.id),
    ["shared-offer", "unique-2026-09-09", "unique-2026-09-10", "unique-2026-09-11"]
  );
});

test("automated tests make no real Duffel API calls", async () => {
  const originalToken = process.env.DUFFEL_ACCESS_TOKEN;
  delete process.env.DUFFEL_ACCESS_TOKEN;

  try {
    const provider = createDuffelFlightProvider({
      delay: noDelay,
      warn: () => {},
      isDevelopment: true,
      async searchExactDate(_input, departureDate) {
        return [createOffer(`offer-${departureDate}`, `${departureDate}T08:00:00`)];
      },
    });

    const offers = await provider.searchOneWay({
      ...sampleInput,
      departureWindow: {
        start: "2026-09-09",
        end: "2026-09-09",
      },
    });

    assert.equal(offers.length, 1);
    assert.equal(offers[0]?.id, "offer-2026-09-09");
  } finally {
    if (originalToken !== undefined) {
      process.env.DUFFEL_ACCESS_TOKEN = originalToken;
    }
  }
});
