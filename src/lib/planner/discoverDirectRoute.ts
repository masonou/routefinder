import {
  buildFlightCalendarCacheKey,
  getFlightCalendarCache,
  runCachedFlightCalendar,
  type FlightCalendarCache,
} from "../cache/flightCalendarCache.ts";
import {
  buildFlightOffersCacheKey,
  getFlightOffersCache,
  runCachedFlightOffers,
  type FlightOffersCache,
} from "../cache/flightOffersCache.ts";
import type { FlightCalendarDay, FlightCalendarProvider, FlightProvider } from "../providers/types.ts";
import { createItinerary, type Itinerary } from "../../types/itinerary.ts";
import type { FlightOffer } from "../../types/flight.ts";
import { addCalendarDays } from "../utils/dateWindow.ts";
import { DEPARTURE_FLEX_DAYS } from "../constants/planner.ts";
import { elapsedMs, nowMs } from "../instrumentation/searchTiming.ts";

// A direct route is a comparison baseline, so it deliberately does not inherit
// hub detour or stay scoring.
export const DIRECT_BASELINE_SCORE = 0;

type WarningFunction = (message: string) => void;

export interface DirectRouteDiscoveryInput {
  origin: string;
  destination: string;
  earliestDeparture: string;
  adults?: number;
}

export interface DirectRouteDiscoveryDependencies {
  flightCalendarProvider: FlightCalendarProvider;
  flightProvider: FlightProvider;
  calendarCache?: FlightCalendarCache | null;
  flightOffersCache?: FlightOffersCache | null;
  warn?: WarningFunction;
  onTiming?: (timing: DirectRouteTiming) => void;
}

export interface DirectRouteTiming {
  calendarMs: number;
  calendarCacheStatus?: "HIT" | "MISS";
  detailedMs: number;
  detailedCacheStatus?: "HIT" | "MISS";
  totalMs: number;
}

export function selectBestDirectCalendarDate(
  calendar: FlightCalendarDay[],
  startDate: string,
  endDate: string,
): string | undefined {
  return calendar
    .filter(
      (day) =>
        day.hasFlights &&
        typeof day.price === "number" &&
        Number.isFinite(day.price) &&
        day.departureDate >= startDate &&
        day.departureDate <= endDate,
    )
    .sort(
      (left, right) =>
        (left.price as number) - (right.price as number) ||
        left.departureDate.localeCompare(right.departureDate),
    )[0]?.departureDate;
}

export function selectBestDirectOffer(
  offers: FlightOffer[],
  origin: string,
  destination: string,
  departureDate: string,
): FlightOffer | undefined {
  return offers
    .filter(
      (offer) =>
        offer.origin === origin &&
        offer.destination === destination &&
        offer.stops === 0 &&
        offer.departureAt.slice(0, 10) === departureDate,
    )
    .sort(
      (left, right) =>
        left.indicativePrice.amount - right.indicativePrice.amount ||
        left.durationMinutes - right.durationMinutes ||
        left.id.localeCompare(right.id),
    )[0];
}

export async function discoverDirectItinerary(
  input: DirectRouteDiscoveryInput,
  dependencies: DirectRouteDiscoveryDependencies,
): Promise<Itinerary | undefined> {
  const startedAt = nowMs();
  const timing: DirectRouteTiming = { calendarMs: 0, detailedMs: 0, totalMs: 0 };
  const origin = input.origin.trim().toUpperCase();
  const destination = input.destination.trim().toUpperCase();
  const startDate = input.earliestDeparture;
  const endDate = addCalendarDays(startDate, DEPARTURE_FLEX_DAYS);
  const calendarCache =
    dependencies.calendarCache === undefined
      ? getFlightCalendarCache()
      : dependencies.calendarCache;
  const flightOffersCache =
    dependencies.flightOffersCache === undefined
      ? getFlightOffersCache()
      : dependencies.flightOffersCache;
  const warn = dependencies.warn ?? console.warn;

  try {
    const calendarStartedAt = nowMs();
    const calendar = await runCachedFlightCalendar({
      key: buildFlightCalendarCacheKey({
        origin,
        destination,
        startDate,
        endDate,
        stopPolicy: "nonstop",
      }),
      cache: calendarCache,
      load: () =>
        dependencies.flightCalendarProvider.getFlightCalendar({
          origin,
          destination,
          departureWindow: { start: startDate, end: endDate },
          stopPolicy: "nonstop",
        }),
      warn,
    });
    timing.calendarMs = elapsedMs(calendarStartedAt);
    timing.calendarCacheStatus = calendar.cacheStatus;
    const selectedDate = selectBestDirectCalendarDate(calendar.value, startDate, endDate);
    if (!selectedDate) return undefined;

    const detailedStartedAt = nowMs();
    const detailed = await runCachedFlightOffers({
      key: buildFlightOffersCacheKey({
        origin,
        destination,
        departureDate: selectedDate,
        adults: input.adults ?? 1,
      }),
      cache: flightOffersCache,
      load: () =>
        dependencies.flightProvider.searchOneWay({
          origin,
          destination,
          departureWindow: { start: selectedDate, end: selectedDate },
          adults: input.adults ?? 1,
        }),
      warn,
    });
    timing.detailedMs = elapsedMs(detailedStartedAt);
    timing.detailedCacheStatus = detailed.cacheStatus;
    const directOffer = selectBestDirectOffer(
      detailed.value,
      origin,
      destination,
      selectedDate,
    );
    if (!directOffer) {
      warn(
        `Direct Calendar/detailed mismatch for ${origin}-${destination} on ${selectedDate}; omitting direct baseline.`,
      );
      return undefined;
    }

    return createItinerary({
      origin,
      destination,
      legs: [{ flight: directOffer }],
      score: DIRECT_BASELINE_SCORE,
    });
  } catch (error) {
    const message = error instanceof Error && error.message.trim()
      ? error.message
      : "Direct route discovery failed.";
    warn(`Direct route discovery failed for ${origin}-${destination}: ${message}`);
    return undefined;
  } finally {
    timing.totalMs = elapsedMs(startedAt);
    dependencies.onTiming?.(timing);
  }
}
