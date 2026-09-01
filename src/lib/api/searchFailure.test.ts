import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySearchFailure,
  createSearchFailureReference,
} from "./searchFailure.ts";
import { FatalSearchStageError } from "../planner/fatalStageFailure.ts";
import { getSearchApiApiKey } from "../providers/searchApi.ts";

function fatalStageFailure(
  stage: "explore" | "calendar" | "detailed",
  childFailures: Array<{ message: string; status?: number; retryable: boolean }>,
) {
  return classifySearchFailure(new FatalSearchStageError(stage, childFailures));
}

test("classifies fatal planner stages separately from normal no-flight outcomes", () => {
  const cases = [
    ["Travel Explore failed for every departure date: unavailable", "SL-EXPLORE-FAILED", "explore"],
    ["Calendar validation failed for every candidate.", "SL-CALENDAR-FAILED", "calendar"],
    ["Detailed verification failed for every candidate.", "SL-DETAILED-FAILED", "detailed"],
    ["unanticipated application problem", "SL-SEARCH-UNKNOWN", "unknown"],
  ] as const;

  for (const [message, failureCode, failureStage] of cases) {
    const classified = classifySearchFailure(new Error(message));
    assert.equal(classified.failureCode, failureCode);
    assert.equal(classified.failureStage, failureStage);
  }
});

test("failure references are opaque, short, and scoped by stable failure code", () => {
  const first = createSearchFailureReference("SL-PROVIDER-UNAVAILABLE");
  const second = createSearchFailureReference("SL-PROVIDER-UNAVAILABLE");

  assert.match(first, /^SL-PROVIDER-UNAVAILABLE-[A-F0-9]{8}$/);
  assert.match(second, /^SL-PROVIDER-UNAVAILABLE-[A-F0-9]{8}$/);
  assert.notEqual(first, second);
  assert.doesNotMatch(first, /BNE|SCL|2026|@|Bearer/i);
});

test("preserves one common provider cause when Explore becomes fatal", () => {
  const auth = fatalStageFailure("explore", Array.from({ length: 4 }, () => ({
    message: "SearchAPI authentication failed.",
    status: 401,
    retryable: false,
  })));
  const unavailable = fatalStageFailure("explore", Array.from({ length: 4 }, () => ({
    message: "SearchAPI service is unavailable.",
    status: 503,
    retryable: true,
  })));

  assert.deepEqual(
    {
      code: auth.failureCode,
      stage: auth.failureStage,
      retryable: auth.retryable,
      providerStatus: auth.providerStatus,
    },
    { code: "SL-PROVIDER-AUTH", stage: "explore", retryable: false, providerStatus: 401 },
  );
  assert.deepEqual(
    {
      code: unavailable.failureCode,
      stage: unavailable.failureStage,
      retryable: unavailable.retryable,
      providerStatus: unavailable.providerStatus,
    },
    {
      code: "SL-PROVIDER-UNAVAILABLE",
      stage: "explore",
      retryable: true,
      providerStatus: 503,
    },
  );
});

test("falls back to a stage code only when fatal child failures have mixed causes", () => {
  const mixed = fatalStageFailure("explore", [
    { message: "SearchAPI request timed out.", status: 504, retryable: true },
    { message: "SearchAPI network request failed.", retryable: true },
    { message: "SearchAPI returned invalid JSON.", status: 502, retryable: false },
    { message: "SearchAPI authentication failed.", status: 401, retryable: false },
  ]);

  assert.equal(mixed.failureCode, "SL-EXPLORE-FAILED");
  assert.equal(mixed.failureStage, "explore");
  assert.equal(mixed.providerStatus, undefined);
});

test("preserves provider causes for fatal Calendar and detailed stages", () => {
  const calendar = fatalStageFailure("calendar", [{
    message: "SearchAPI service is unavailable.",
    status: 503,
    retryable: true,
  }]);
  const detailed = fatalStageFailure("detailed", [{
    message: "SearchAPI request timed out.",
    status: 504,
    retryable: true,
  }]);

  assert.equal(calendar.failureCode, "SL-PROVIDER-UNAVAILABLE");
  assert.equal(calendar.failureStage, "calendar");
  assert.equal(calendar.retryable, true);
  assert.equal(calendar.providerStatus, 503);
  assert.equal(detailed.failureCode, "SL-PROVIDER-TIMEOUT");
  assert.equal(detailed.failureStage, "detailed");
  assert.equal(detailed.retryable, true);
  assert.match(
    createSearchFailureReference(detailed.failureCode),
    /^SL-PROVIDER-TIMEOUT-[A-F0-9]{8}$/,
  );
});

test("classifies a locally missing SearchAPI key as non-retryable authentication failure", () => {
  let missingKeyError: unknown;
  try {
    getSearchApiApiKey({});
  } catch (error) {
    missingKeyError = error;
  }

  const failure = classifySearchFailure(missingKeyError);
  assert.equal(failure.failureCode, "SL-PROVIDER-AUTH");
  assert.equal(failure.failureStage, "provider");
  assert.equal(failure.retryable, false);
  assert.equal(failure.providerStatus, undefined);
});
