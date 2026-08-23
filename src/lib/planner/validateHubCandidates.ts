import {
  buildFlightCalendarCacheKey,
  getFlightCalendarCache,
  runCachedFlightCalendar,
  type FlightCalendarCache,
} from "../cache/flightCalendarCache.ts";
import {
  CALENDAR_VALIDATION_CONCURRENCY,
  MAX_CALENDAR_CANDIDATES,
  MAX_HUB_STAY_NIGHTS,
  MAX_VALIDATED_HUBS,
  MIN_HUB_STAY_NIGHTS,
  TARGET_HUB_STAY_NIGHTS,
} from "../constants/planner.ts";
import type {
  FlightCalendarDay,
  FlightCalendarProvider,
} from "../providers/types.ts";
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

export interface ValidatedHubCandidate extends HubCandidate {
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
}

export interface CalendarValidationLookup {
  airportCode: string;
  cacheStatus: "HIT" | "MISS";
}

export interface ValidateHubCandidatesResult {
  validatedCandidates: ValidatedHubCandidate[];
  topCandidates: ValidatedHubCandidate[];
  rejectedNoViableDates: string[];
  failures: CalendarValidationFailure[];
  calendarLookups: CalendarValidationLookup[];
}

export interface ValidateHubCandidatesInput {
  candidates: HubCandidate[];
  destination: string;
}

export interface ValidateHubCandidatesOptions {
  cache?: FlightCalendarCache | null;
  warn?: (message: string) => void;
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
}

interface CandidateValidationFailure {
  type: "failure";
  airportCode: string;
  message: string;
}

type CandidateValidationOutcome =
  | CandidateValidationSuccess
  | CandidateValidationRejected
  | CandidateValidationFailure;

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
): ValidatedHubCandidate {
  const best = selectBestOnwardOption(onwardOptions);
  const estimatedTotalPrice =
    candidate.indicativeFirstLegPrice !== undefined &&
    candidate.currency === best.currency
      ? candidate.indicativeFirstLegPrice + best.indicativePrice
      : undefined;

  return {
    ...candidate,
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
  const pendingCandidates: PendingCandidate[] = input.candidates
    .slice(0, MAX_CALENDAR_CANDIDATES)
    .map((candidate) => ({
      candidate,
      startDate: addCalendarDays(candidate.firstLegDepartureDate, MIN_HUB_STAY_NIGHTS),
      endDate: addCalendarDays(candidate.firstLegDepartureDate, MAX_HUB_STAY_NIGHTS),
    }));

  const outcomes = await mapWithConcurrency(
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
          }),
          cache,
          load: () =>
            provider.getFlightCalendar({
              origin: candidate.airportCode,
              destination,
              departureWindow: { start: startDate, end: endDate },
            }),
          warn,
        });
        const onwardOptions = getOnwardOptions(
          candidate.firstLegDepartureDate,
          result.value,
        );
        if (onwardOptions.length === 0) {
          return { type: "rejected", airportCode: candidate.airportCode };
        }

        return {
          type: "success",
          candidate: withSelectedOnwardOption(candidate, onwardOptions),
          cacheStatus: result.cacheStatus,
        };
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : "Calendar provider request failed.";
        warn(`Calendar validation failed for ${candidate.airportCode}: ${message}`);
        return { type: "failure", airportCode: candidate.airportCode, message };
      }
    },
  );

  const validatedCandidates = rankValidatedCandidates(
    outcomes
      .filter((outcome): outcome is CandidateValidationSuccess => outcome.type === "success")
      .map((outcome) => outcome.candidate),
  );

  return {
    validatedCandidates,
    topCandidates: validatedCandidates.slice(0, MAX_VALIDATED_HUBS),
    rejectedNoViableDates: outcomes
      .filter((outcome): outcome is CandidateValidationRejected => outcome.type === "rejected")
      .map((outcome) => outcome.airportCode),
    failures: outcomes
      .filter((outcome): outcome is CandidateValidationFailure => outcome.type === "failure")
      .map(({ airportCode, message }) => ({ airportCode, message })),
    calendarLookups: outcomes
      .filter((outcome): outcome is CandidateValidationSuccess => outcome.type === "success")
      .map(({ candidate, cacheStatus }) => ({
        airportCode: candidate.airportCode,
        cacheStatus,
      })),
  };
}
