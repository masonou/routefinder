import assert from "node:assert/strict";
import test from "node:test";

import { getDuffelConfig } from "./duffelConfig.ts";

test("missing DUFFEL_MODE defaults to the test token", () => {
  const config = getDuffelConfig({
    DUFFEL_ACCESS_TOKEN: "duffel_test_legacy",
  });

  assert.deepEqual(config, {
    mode: "test",
    accessToken: "duffel_test_legacy",
  });
});

test("test mode prefers DUFFEL_TEST_TOKEN over the legacy test token", () => {
  const config = getDuffelConfig({
    DUFFEL_MODE: "test",
    DUFFEL_TEST_TOKEN: "duffel_test_preferred",
    DUFFEL_ACCESS_TOKEN: "duffel_test_legacy",
  });

  assert.equal(config.mode, "test");
  assert.equal(config.accessToken, "duffel_test_preferred");
});

test("live mode selects only DUFFEL_LIVE_TOKEN", () => {
  const config = getDuffelConfig({
    DUFFEL_MODE: "live",
    DUFFEL_LIVE_TOKEN: "duffel_live_read_only",
    DUFFEL_TEST_TOKEN: "duffel_test_ignored",
    DUFFEL_ACCESS_TOKEN: "duffel_test_legacy",
  });

  assert.deepEqual(config, {
    mode: "live",
    accessToken: "duffel_live_read_only",
  });
});

test("live mode never falls back to a test token", () => {
  assert.throws(
    () =>
      getDuffelConfig({
        DUFFEL_MODE: "live",
        DUFFEL_TEST_TOKEN: "duffel_test_not_a_live_token",
        DUFFEL_ACCESS_TOKEN: "duffel_test_legacy",
      }),
    /DUFFEL_LIVE_TOKEN is missing/
  );
});

test("invalid Duffel mode throws", () => {
  assert.throws(
    () =>
      getDuffelConfig({
        DUFFEL_MODE: "preview",
        DUFFEL_TEST_TOKEN: "duffel_test_example",
      }),
    /DUFFEL_MODE must be either/
  );
});

test("missing or mismatched live tokens fail without exposing the token", () => {
  const privateToken = "duffel_test_should_not_be_disclosed";

  assert.throws(
    () => getDuffelConfig({ DUFFEL_MODE: "live" }),
    /DUFFEL_LIVE_TOKEN is missing/
  );

  assert.throws(
    () =>
      getDuffelConfig({
        DUFFEL_MODE: "live",
        DUFFEL_LIVE_TOKEN: privateToken,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /does not appear to be a live token/);
      assert.doesNotMatch(error.message, new RegExp(privateToken));
      return true;
    }
  );
});
