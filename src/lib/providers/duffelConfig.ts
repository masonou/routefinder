// This module is intentionally imported only by server-side Duffel provider code.
export type DuffelMode = "test" | "live";

export interface DuffelConfig {
  mode: DuffelMode;
  accessToken: string;
}

const DUFFEL_TEST_TOKEN_PREFIX = "duffel_test_";
const DUFFEL_LIVE_TOKEN_PREFIX = "duffel_live_";

type DuffelEnvironment = Record<string, string | undefined>;

function getNonEmptyEnvironmentValue(
  environment: DuffelEnvironment,
  name: string
): string | undefined {
  const value = environment[name]?.trim();
  return value || undefined;
}

function getDuffelMode(environment: DuffelEnvironment): DuffelMode {
  const configuredMode =
    getNonEmptyEnvironmentValue(environment, "DUFFEL_MODE") ?? "test";

  if (configuredMode === "test" || configuredMode === "live") {
    return configuredMode;
  }

  throw new Error('DUFFEL_MODE must be either "test" or "live".');
}

function assertExpectedTokenPrefix(
  mode: DuffelMode,
  accessToken: string | undefined
): asserts accessToken is string {
  const expectedPrefix =
    mode === "live" ? DUFFEL_LIVE_TOKEN_PREFIX : DUFFEL_TEST_TOKEN_PREFIX;

  if (accessToken?.startsWith(expectedPrefix)) {
    return;
  }

  if (mode === "live") {
    throw new Error(
      "DUFFEL_MODE is set to live but DUFFEL_LIVE_TOKEN is missing or does not appear to be a live token."
    );
  }

  throw new Error(
    "DUFFEL_MODE is set to test but the test token is missing or does not appear to be a test token."
  );
}

export function getDuffelConfig(
  environment: DuffelEnvironment = process.env
): DuffelConfig {
  const mode = getDuffelMode(environment);
  const accessToken =
    mode === "live"
      ? getNonEmptyEnvironmentValue(environment, "DUFFEL_LIVE_TOKEN")
      : getNonEmptyEnvironmentValue(environment, "DUFFEL_TEST_TOKEN") ??
        getNonEmptyEnvironmentValue(environment, "DUFFEL_ACCESS_TOKEN");

  assertExpectedTokenPrefix(mode, accessToken);

  return { mode, accessToken };
}
