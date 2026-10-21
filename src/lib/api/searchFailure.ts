import { normalizeSearchApiError } from "../providers/searchApi.ts";
import { FatalSearchStageError } from "../planner/fatalStageFailure.ts";

export type SearchFailureCode =
  | "SL-PROVIDER-TIMEOUT"
  | "SL-PROVIDER-RATE-LIMIT"
  | "SL-PROVIDER-UNAVAILABLE"
  | "SL-PROVIDER-AUTH"
  | "SL-PROVIDER-NETWORK"
  | "SL-PROVIDER-INVALID-RESPONSE"
  | "SL-EXPLORE-FAILED"
  | "SL-CALENDAR-FAILED"
  | "SL-DETAILED-FAILED"
  | "SL-REQUEST-NETWORK"
  | "SL-SEARCH-UNKNOWN";

export type SearchFailureStage =
  | "request"
  | "explore"
  | "calendar"
  | "detailed"
  | "provider"
  | "unknown";

export interface SearchFailureResponse {
  error: string;
  failureCode: SearchFailureCode;
  failureReference: string;
  failureStage: SearchFailureStage;
  retryable: boolean;
  providerStatus?: number;
}

export interface ClassifiedSearchFailure {
  failureCode: SearchFailureCode;
  failureStage: SearchFailureStage;
  retryable: boolean;
  providerStatus?: number;
  status: 429 | 500 | 502 | 503 | 504;
  internalMessage: string;
}

function statusForFailure(
  failureCode: SearchFailureCode,
  providerStatus: number | undefined,
): ClassifiedSearchFailure["status"] {
  if (providerStatus === 429 || providerStatus === 502 || providerStatus === 503 || providerStatus === 504) {
    return providerStatus;
  }
  if (failureCode === "SL-PROVIDER-TIMEOUT") return 504;
  if (failureCode === "SL-PROVIDER-RATE-LIMIT") return 429;
  if (failureCode === "SL-PROVIDER-UNAVAILABLE" || failureCode === "SL-PROVIDER-NETWORK") return 503;
  if (failureCode === "SL-PROVIDER-INVALID-RESPONSE") return 502;
  return 500;
}

function pipelineFailure(message: string): Pick<ClassifiedSearchFailure, "failureCode" | "failureStage"> | null {
  if (/Travel Explore failed for every departure date/i.test(message)) {
    return { failureCode: "SL-EXPLORE-FAILED", failureStage: "explore" };
  }
  if (/Calendar validation failed for every candidate/i.test(message)) {
    return { failureCode: "SL-CALENDAR-FAILED", failureStage: "calendar" };
  }
  if (/Detailed verification failed for every candidate/i.test(message)) {
    return { failureCode: "SL-DETAILED-FAILED", failureStage: "detailed" };
  }
  return null;
}

function classifyProviderFailure(
  normalized: ReturnType<typeof normalizeSearchApiError>,
): Pick<ClassifiedSearchFailure, "failureCode" | "retryable" | "providerStatus" | "status" | "internalMessage"> {
  let failureCode: SearchFailureCode = "SL-SEARCH-UNKNOWN";
  if (normalized.status === 504 || /timed out/i.test(normalized.message)) {
    failureCode = "SL-PROVIDER-TIMEOUT";
  } else if (normalized.status === 429 || /rate limit exceeded/i.test(normalized.message)) {
    failureCode = "SL-PROVIDER-RATE-LIMIT";
  } else if (
    normalized.status === 401 ||
    normalized.status === 403 ||
    /authentication failed|SEARCHAPI_API_KEY is not configured/i.test(normalized.message)
  ) {
    failureCode = "SL-PROVIDER-AUTH";
  } else if (/invalid JSON|unexpected response|without usable flight data/i.test(normalized.message)) {
    failureCode = "SL-PROVIDER-INVALID-RESPONSE";
  } else if (
    (normalized.status !== undefined && normalized.status >= 500) ||
    /service is unavailable/i.test(normalized.message)
  ) {
    failureCode = "SL-PROVIDER-UNAVAILABLE";
  } else if (/network request failed|network/i.test(normalized.message)) {
    failureCode = "SL-PROVIDER-NETWORK";
  }

  return {
    failureCode,
    retryable: normalized.retryable,
    ...(normalized.status === undefined ? {} : { providerStatus: normalized.status }),
    status: statusForFailure(failureCode, normalized.status),
    internalMessage: normalized.message,
  };
}

function stageFallback(stage: "explore" | "calendar" | "detailed"): SearchFailureCode {
  return stage === "explore"
    ? "SL-EXPLORE-FAILED"
    : stage === "calendar"
      ? "SL-CALENDAR-FAILED"
      : "SL-DETAILED-FAILED";
}

function classifyFatalStageFailure(error: FatalSearchStageError): ClassifiedSearchFailure {
  const causes = error.childFailures.map(classifyProviderFailure);
  const specificCodes = causes
    .map((cause) => cause.failureCode)
    .filter((code) => code.startsWith("SL-PROVIDER-"));
  const commonCode =
    specificCodes.length === causes.length && new Set(specificCodes).size === 1
      ? specificCodes[0] as SearchFailureCode
      : undefined;
  const commonStatus =
    causes.length > 0 && new Set(causes.map((cause) => cause.providerStatus)).size === 1
      ? causes[0]?.providerStatus
      : undefined;

  if (commonCode) {
    const representative = causes[0] as (typeof causes)[number];
    return {
      failureCode: commonCode,
      failureStage: error.stage,
      retryable: representative.retryable,
      ...(commonStatus === undefined ? {} : { providerStatus: commonStatus }),
      status: statusForFailure(commonCode, commonStatus),
      internalMessage: representative.internalMessage,
    };
  }

  const failureCode = stageFallback(error.stage);
  return {
    failureCode,
    failureStage: error.stage,
    retryable: causes.some((cause) => cause.retryable),
    ...(commonStatus === undefined ? {} : { providerStatus: commonStatus }),
    status: statusForFailure(failureCode, commonStatus),
    internalMessage: causes.length > 0
      ? `Mixed provider failures: ${causes.map((cause) => cause.internalMessage).join(" | ")}`
      : error.message,
  };
}

export function classifySearchFailure(error: unknown): ClassifiedSearchFailure {
  if (error instanceof FatalSearchStageError) {
    return classifyFatalStageFailure(error);
  }

  const normalized = normalizeSearchApiError(error);
  const pipeline = pipelineFailure(normalized.message);
  if (pipeline) {
    return {
      ...pipeline,
      retryable: normalized.retryable,
      ...(normalized.status === undefined ? {} : { providerStatus: normalized.status }),
      status: statusForFailure(pipeline.failureCode, normalized.status),
      internalMessage: normalized.message,
    };
  }

  const provider = classifyProviderFailure(normalized);
  return {
    ...provider,
    failureStage: provider.failureCode === "SL-SEARCH-UNKNOWN" ? "unknown" : "provider",
  };
}

export function createSearchFailureReference(failureCode: SearchFailureCode): string {
  const suffix = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${failureCode}-${suffix}`;
}
