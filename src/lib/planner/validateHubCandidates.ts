import {
  buildFlightCalendarCacheKey,
  getFlightCalendarCache,
  runCachedFlightCalendar,
  type FlightCalendarCache,
} from "../cache/flightCalendarCache.ts";
import {
  CALENDAR_VALIDATION_CONCURRENCY,
  MAX_CALENDAR_CANDIDATES,
  MAX_CONNECTING_FALLBACK_CALENDAR_CALLS,
  MAX_HUB_STAY_NIGHTS,
  MAX_VALIDATED_HUBS,
  MIN_HUB_STAY_NIGHTS,
  TARGET_HUB_STAY_NIGHTS,
} from "../constants/planner.ts";
import type {
  FlightCalendarDay,
  FlightCalendarProvider,
} from "../providers/types.ts";
import { normalizeSearchApiError, type NormalizedSearchApiError } from "../providers/searchApi.ts";
import {
  addCalendarDays,
  calendarDayDifference,
} from "../utils/dateWindow.ts";
import type { HubCandidate } from "./hubCandidates.ts";

const STAY_PENALTY_PER_NIGHT = 0.04;

export interface OnwardOption {
  departureDate: string;
  stayNights: number;
  indicativePrice: number;
  currency: string;
}

export type OnwardFlightPolicy = "nonstop" | "connecting_fallback";

export interface ValidatedHubCandidate extends HubCandidate {
  onwardPolicy: OnwardFlightPolicy;
  onwardOptions: OnwardOption[];
  bestOnwardDate: string;
  bestOnwardPrice: number;
  bestStayNights: number;
  estimatedTotalPrice?: number;
  validationScore: number;
}

export interface CalendarValidationFailure {
  airportCode: string;
  message: string;
  cause: NormalizedSearchApiError;
}

export interface CalendarValidationLookup {
  airportCode: string;
  firstLegDepartureDate: string;
  onwardPolicy: OnwardFlightPolicy;
  cacheStatus: "HIT" | "MISS";
  outcome: "viable" | "no_viable_dates";
}

export interface ValidateHubCandidatesResult {
  validatedCandidates: ValidatedHubCandidate[];
  topCandidates: ValidatedHubCandidate[];
  rejectedNoViableDates: string[];
  failures: CalendarValidationFailure[];
  calendarLookups: CalendarValidationLookup[];
  nonstopCalendarChecks: number;
  fallbackCalendarChecks: number;
  cleanHubCount: number;
}

export interface ValidateHubCandidatesInput {
  candidates: HubCandidate[];
  destination: string;
}

export interface ValidateHubCandidatesOptions {
  cache?: FlightCalendarCache | null;
  warn?: (message: string) => void;
  mode?: "clean" | "fallback" | "both";
}

interface PendingCandidate {
  candidate: HubCandidate;
  startDate: string;
  endDate: string;
}

interface CandidateValidationSuccess {
  type: "success";
  candidate: ValidatedHubCandidate;
  cacheStatus: "HIT" | "MISS";
}

interface CandidateValidationRejected {
  type: "rejected";
  airportCode: string;
  firstLegDepartureDate: string;
  onwardPolicy: OnwardFlightPolicy;
  cacheStatus: "HIT" | "MISS";
}

interface CandidateValidationFailure {
  type: "failure";
  airportCode: string;
  message: string;
  cause: NormalizedSearchApiError;
}

type CandidateValidationOutcome =
  | CandidateValidationSuccess
  | CandidateValidationRejected
  | CandidateValidationFailure;

function createCalendarValidationFailure(
  airportCode: string,
  message: string,
  cause: NormalizedSearchApiError,
): CalendarValidationFailure {
  const failure = { airportCode, message } as CalendarValidationFailure;
  Object.defineProperty(failure, "cause", { value: cause, enumerable: false });
  return failure;
}

function getOnwardOptions(
  firstLegDepartureDate: string,
  calendar: FlightCalendarDay[],
): OnwardOption[] {
  return calendar
    .filter(
      (day) => day.hasFlights && day.price !== undefined && Number.isFinite(day.price),
    )
    .map((day) => ({
      departureDate: day.departureDate,
      stayNights: calendarDayDifference(firstLegDepartureDate, day.departureDate),
      indicativePrice: day.price as number,
      currency: day.currency,
    }))
    .filter(
      (option) =>
        option.stayNights >= MIN_HUB_STAY_NIGHTS &&
        option.stayNights <= MAX_HUB_STAY_NIGHTS,
    )
    .sort(
      (left, right) =>
        left.departureDate.localeCompare(right.departureDate) ||
        left.indicativePrice - right.indicativePrice,
    );
}

function adjustedOnwardPrice(option: OnwardOption): number {
  // Each night away from the four-night target adds a mild 4% adjustment.
  // A substantially cheaper two-, three-, five-, or six-night fare can still win.
  return (
    option.indicativePrice *
    (1 + Math.abs(option.stayNights - TARGET_HUB_STAY_NIGHTS) * STAY_PENALTY_PER_NIGHT)
  );
}

function selectBestOnwardOption(options: OnwardOption[]): OnwardOption {
  return [...options].sort(
    (left, right) =>
      adjustedOnwardPrice(left) - adjustedOnwardPrice(right) ||
      left.indicativePrice - right.indicativePrice ||
      left.departureDate.localeCompare(right.departureDate),
  )[0] as OnwardOption;
}

function withSelectedOnwardOption(
  candidate: HubCandidate,
  onwardOptions: OnwardOption[],
  onwardPolicy: OnwardFlightPolicy,
): ValidatedHubCandidate {
  const best = selectBestOnwardOption(onwardOptions);
  const estimatedTotalPrice =
    candidate.indicativeFirstLegPrice !== undefined &&
    candidate.currency === best.currency
      ? candidate.indicativeFirstLegPrice + best.indicativePrice
      : undefined;

  return {
    ...candidate,
    onwardPolicy,
    onwardOptions,
    bestOnwardDate: best.departureDate,
    bestOnwardPrice: best.indicativePrice,
    bestStayNights: best.stayNights,
    ...(estimatedTotalPrice === undefined ? {} : { estimatedTotalPrice }),
    validationScore: 0,
  };
}

function normalizedLowerIsBetter(value: number, values: number[]): number {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return maximum === minimum ? 1 : (maximum - value) / (maximum - minimum);
}

function normalizedHigherIsBetter(value: number, values: number[]): number {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return maximum === minimum ? 1 : (value - minimum) / (maximum - minimum);
}

function rankValidatedCandidates(
  candidates: ValidatedHubCandidate[],
): ValidatedHubCandidate[] {
  const comparablePrices = candidates.map(
    (candidate) => candidate.estimatedTotalPrice ?? candidate.bestOnwardPrice,
  );
  const detours = candidates.map((candidate) => candidate.detourRatio);
  const candidateScores = candidates.map((candidate) => candidate.candidateScore);

  return candidates
    .map((candidate) => {
      const comparablePrice =
        candidate.estimatedTotalPrice ?? candidate.bestOnwardPrice;
      const priceScore = normalizedLowerIsBetter(comparablePrice, comparablePrices) * 60;
      const detourScore = normalizedLowerIsBetter(candidate.detourRatio, detours) * 25;
      const stayScore =
        Math.max(
          0,
          1 -
            Math.abs(candidate.bestStayNights - TARGET_HUB_STAY_NIGHTS) /
              (MAX_HUB_STAY_NIGHTS - MIN_HUB_STAY_NIGHTS) *
              2,
        ) * 10;
      const firstLegScore =
        normalizedHigherIsBetter(candidate.candidateScore, candidateScores) * 5;

      // Validation ranking uses relative values among currently validated hubs:
      // estimated total price 60%, detour 25%, target-stay fit 10%, and the
      // original first-leg candidate quality 5%.
      return {
        ...candidate,
        validationScore: Number(
          (priceScore + detourScore + stayScore + firstLegScore).toFixed(3),
        ),
      };
    })
    .sort(
      (left, right) =>
        right.validationScore - left.validationScore ||
        (left.estimatedTotalPrice ?? left.bestOnwardPrice) -
          (right.estimatedTotalPrice ?? right.bestOnwardPrice) ||
        left.detourRatio - right.detourRatio ||
        left.airportCode.localeCompare(right.airportCode),
    );
}

export function collapseValidatedHubVariants(
  candidates: ValidatedHubCandidate[],
): ValidatedHubCandidate[] {
  const bestByHub = new Map<string, ValidatedHubCandidate>();

  for (const candidate of candidates) {
    const hub = candidate.airportCode.trim().toUpperCase();
    if (!bestByHub.has(hub)) {
      bestByHub.set(hub, candidate);
    }
  }

  return [...bestByHub.values()];
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return results;
}

export async function validateHubCandidates(
  input: ValidateHubCandidatesInput,
  provider: FlightCalendarProvider,
  options: ValidateHubCandidatesOptions = {},
): Promise<ValidateHubCandidatesResult> {
  const destination = input.destination.trim().toUpperCase();
  if (!destination) {
    throw new Error("Destination is required.");
  }

  const cache = options.cache === undefined ? getFlightCalendarCache() : options.cache;
  const warn = options.warn ?? console.warn;
  const mode = options.mode ?? "clean";
  const validate = async (
    candidates: HubCandidate[],
    onwardPolicy: OnwardFlightPolicy,
  ): Promise<CandidateValidationOutcome[]> => {
    const pendingCandidates: PendingCandidate[] = candidates.map((candidate) => ({
      candidate,
      startDate: addCalendarDays(candidate.firstLegDepartureDate, MIN_HUB_STAY_NIGHTS),
      endDate: addCalendarDays(candidate.firstLegDepartureDate, MAX_HUB_STAY_NIGHTS),
    }));
    const stopPolicy =
      onwardPolicy === "nonstop" ? "nonstop" : "two_stops_or_fewer";

    return mapWithConcurrency(
      pendingCandidates,
      CALENDAR_VALIDATION_CONCURRENCY,
      async ({ candidate, startDate, endDate }): Promise<CandidateValidationOutcome> => {
      try {
        const result = await runCachedFlightCalendar({
          key: buildFlightCalendarCacheKey({
            origin: candidate.airportCode,
            destination,
            startDate,
            endDate,
            stopPolicy,
          }),
          cache,
          load: () =>
            provider.getFlightCalendar({
              origin: candidate.airportCode,
              destination,
              departureWindow: { start: startDate, end: endDate },
              stopPolicy,
            }),
          warn,
        });
        const onwardOptions = getOnwardOptions(
          candidate.firstLegDepartureDate,
          result.value,
        );
        if (onwardOptions.length === 0) {
          return {
            type: "rejected",
            airportCode: candidate.airportCode,
            firstLegDepartureDate: candidate.firstLegDepartureDate,
            onwardPolicy,
            cacheStatus: result.cacheStatus,
          };
        }

        return {
          type: "success",
          candidate: withSelectedOnwardOption(candidate, onwardOptions, onwardPolicy),
          cacheStatus: result.cacheStatus,
        };
      } catch (error) {
        const cause = normalizeSearchApiError(error);
        const message = cause.message;
        warn(`Calendar validation failed for ${candidate.airportCode}: ${message}`);
        return { type: "failure", airportCode: candidate.airportCode, message, cause };
      }
      },
    );
  };

  const calendarCandidates = input.candidates.slice(0, MAX_CALENDAR_CANDIDATES);
  const nonstopOutcomes = mode === "fallback"
    ? []
    : await validate(calendarCandidates, "nonstop");
  const cleanCandidates = collapseValidatedHubVariants(rankValidatedCandidates(
    nonstopOutcomes
      .filter((outcome): outcome is CandidateValidationSuccess => outcome.type === "success")
      .map((outcome) => outcome.candidate),
  ));
  const cleanHubs = new Set(
    cleanCandidates.map((candidate) => candidate.airportCode.trim().toUpperCase()),
  );
  const fallbackCandidates = mode === "clean"
    ? []
    : mode === "fallback"
      ? calendarCandidates.slice(0, MAX_CONNECTING_FALLBACK_CALENDAR_CALLS)
      : cleanCandidates.length >= MAX_VALIDATED_HUBS
        ? []
        : calendarCandidates
          .filter((candidate) => !cleanHubs.has(candidate.airportCode.trim().toUpperCase()))
          .slice(0, MAX_CONNECTING_FALLBACK_CALENDAR_CALLS);
  const fallbackOutcomes = mode === "clean"
    ? []
    : await validate(fallbackCandidates, "connecting_fallback");
  const fallbackValidatedCandidates = collapseValidatedHubVariants(rankValidatedCandidates(
    fallbackOutcomes
      .filter((outcome): outcome is CandidateValidationSuccess => outcome.type === "success")
      .map((outcome) => outcome.candidate),
  ));
  const validatedCandidates = [...cleanCandidates, ...fallbackValidatedCandidates];
  const outcomes = [...nonstopOutcomes, ...fallbackOutcomes];

  return {
    validatedCandidates,
    topCandidates: validatedCandidates.slice(0, MAX_VALIDATED_HUBS),
    rejectedNoViableDates: [...new Set(
      outcomes
        .filter((outcome): outcome is CandidateValidationRejected => outcome.type === "rejected")
        .map((outcome) => outcome.airportCode),
    )],
    failures: [...new Map(
      outcomes
        .filter((outcome): outcome is CandidateValidationFailure => outcome.type === "failure")
        .map(({ airportCode, message, cause }) => [
          airportCode,
          createCalendarValidationFailure(airportCode, message, cause),
        ] as const),
    ).values()],
    // Keep lookup accounting for both viable and no-flight Calendar results.
    // The production planner does not consume this field; it lets diagnostics
    // separate live API calls from cached negative results.
    calendarLookups: outcomes
      .filter(
        (outcome): outcome is CandidateValidationSuccess | CandidateValidationRejected =>
          outcome.type === "success" || outcome.type === "rejected",
      )
      .map((outcome) => ({
        airportCode:
          outcome.type === "success"
            ? outcome.candidate.airportCode
            : outcome.airportCode,
        firstLegDepartureDate:
          outcome.type === "success"
            ? outcome.candidate.firstLegDepartureDate
            : outcome.firstLegDepartureDate,
        onwardPolicy:
          outcome.type === "success"
            ? outcome.candidate.onwardPolicy
            : outcome.onwardPolicy,
        cacheStatus: outcome.cacheStatus,
        outcome: outcome.type === "success" ? "viable" : "no_viable_dates",
      })),
    nonstopCalendarChecks: calendarCandidates.length,
    fallbackCalendarChecks: fallbackCandidates.length,
    cleanHubCount: cleanCandidates.length,
  };
}
