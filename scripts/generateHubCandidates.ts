import nextEnv from "@next/env";

import { getDirectDestinationsCache } from "../src/lib/cache/directDestinationsCache.ts";
import { getFlightCalendarCache } from "../src/lib/cache/flightCalendarCache.ts";
import { getFlightOffersCache } from "../src/lib/cache/flightOffersCache.ts";
import { searchDynamicRoutePortfolio } from "../src/lib/planner/searchDynamicRoutes.ts";
import { classifySearchFailure } from "../src/lib/api/searchFailure.ts";
import { arrivesByDate, calculateHubStayHours } from "../src/lib/planner/filters.ts";
import { createSearchApiFlightProvider, type SearchApiExploreTrace, type SearchApiRequestTiming } from "../src/lib/providers/searchApi.ts";
import { createSearchRequestFromFormValues, toTripRequest } from "../src/lib/utils/searchValidation.ts";
import { calendarDayDifference } from "../src/lib/utils/dateWindow.ts";
import { formatDuration, formatMoney } from "../src/lib/utils/formatFlight.ts";
import type { Itinerary } from "../src/types/itinerary.ts";

nextEnv.loadEnvConfig(process.cwd());

const USAGE = "Usage:\nnpm run hubs:debug -- <origin> <destination> <departureDate> <arriveByDate> [--force-two-stop]\n\nExample:\nnpm run hubs:debug -- DTW MLA 2027-02-11 2027-02-19";

function table(title: string, rows: object[]): void {
  console.log(`\n${title}`);
  if (rows.length === 0) console.log("None.");
  else console.table(rows);
}

function stay(first: Itinerary["legs"][number]["flight"], second: Itinerary["legs"][number]["flight"]): string {
  const hours = calculateHubStayHours(first, second);
  return hours < 0 ? "invalid" : formatDuration(Math.round(hours * 60));
}

function printItineraries(title: string, itineraries: Itinerary[], arriveBy: string): void {
  table(title, itineraries.map((itinerary) => {
    const finalFlight = itinerary.legs.at(-1)?.flight;
    return {
      route: itinerary.legs.map((leg) => `${leg.flight.origin}→${leg.flight.destination}`).join(" | "),
      stopovers: itinerary.legs.flatMap((leg, index) => leg.stopoverAfter && itinerary.legs[index + 1]
        ? [`${leg.stopoverAfter.airportCode}: ${stay(leg.flight, itinerary.legs[index + 1]!.flight)}`] : []).join("; "),
      finalArrival: finalFlight?.arrivalAt ?? "",
      insideWindow: finalFlight && arrivesByDate(finalFlight, arriveBy) ? "yes" : "NO",
      price: formatMoney(itinerary.totalPrice.amount, itinerary.totalPrice.currency),
    };
  }));
}

async function run(): Promise<void> {
  const [origin = "", destination = "", departureDate = "", arriveByDate = "", ...flags] = process.argv.slice(2);
  let request;
  try {
    request = createSearchRequestFromFormValues({ origin, destination, earliestDeparture: departureDate, arriveBy: arriveByDate });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid search.");
    console.error(`\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const forceTwoStop = flags.includes("--force-two-stop");
  console.log(`${request.origin} → ${request.destination}\nDepart: ${request.earliestDeparture}\nArrive by: ${request.arriveBy}\nJourney window: ${calendarDayDifference(request.earliestDeparture, request.arriveBy)} days`);

  const timings: SearchApiRequestTiming[] = [];
  const explores: SearchApiExploreTrace[] = [];
  const provider = createSearchApiFlightProvider({ diagnostics: {
    onRequestTiming: (timing) => timings.push(timing),
    onExploreTrace: (trace) => explores.push(trace),
  } });
  const startedAt = performance.now();
  const result = await searchDynamicRoutePortfolio(toTripRequest(request), { forceTwoStop }, {
    directDestinationsProvider: provider,
    flightCalendarProvider: provider,
    flightProvider: provider,
    directDestinationsCache: getDirectDestinationsCache(),
    flightCalendarCache: getFlightCalendarCache(),
    flightOffersCache: getFlightOffersCache(),
  });

  table("EXPLORE RESPONSES", explores.map((trace) => ({
    route: trace.request.departure_id, date: trace.request.time_period,
    status: trace.status, destinations: trace.destinations,
    rawDestinations: trace.rawDestinations, usableDestinations: trace.mappedDestinations.length,
    outcome: trace.outcome, topLevelKeys: trace.responseKeys.join(", "),
    metadataStatus: trace.metadataStatus ?? "", searchParametersKeys: trace.searchParametersKeys.join(", "),
    providerMessage: trace.providerMessage ?? "",
  })));
  table("CANDIDATE HUBS", explores.flatMap((trace) => trace.mappedDestinations.map((hub) => ({
    hub: hub.airportCode, city: hub.city, country: hub.country, outboundDate: hub.outboundDate,
    price: hub.indicativePrice ?? "", durationMinutes: hub.flightDurationMinutes ?? "",
  }))));
  const oneStop = result.itineraries.filter((itinerary) => itinerary.legs.length === 2);
  const twoStop = result.itineraries.filter((itinerary) => itinerary.legs.length === 3);
  printItineraries("ONE-STOP RESULTS", oneStop, request.arriveBy);
  printItineraries("TWO-STOP RESULTS", twoStop, request.arriveBy);
  console.log(`\nFINAL OUTCOME\n${result.outcome}`);
  console.log(`\nTWO-STOP ELIGIBILITY\neligible: ${result.twoStopDiscovery.explored ? "yes" : "no"}\nreason: ${result.twoStopDiscovery.reason}`);

  const byEngine = (engine: string) => timings.filter((entry) => entry.engine === engine);
  const explore = byEngine("google_travel_explore");
  const calendar = byEngine("google_flights_calendar");
  const detailed = byEngine("google_flights");
  table("SEARCHAPI REQUESTS", timings.map((entry) => ({ engine: entry.engine, route: entry.route ?? "", date: entry.date ?? "", status: entry.status ?? "network", success: entry.success, retryAttempt: entry.retryAttempt, durationMs: entry.durationMs })));
  console.log(`\nFINAL RESULTS\nOne-stop: ${oneStop.length}\nTwo-stop: ${twoStop.length}\nTotal: ${result.itineraries.length}`);
  console.log(`\nSEARCHAPI CALLS\nOutbound Explore: ${explore.filter((entry) => entry.route === request.origin).length}\nReverse Explore: ${explore.filter((entry) => entry.route === request.destination).length}\nCalendar: ${calendar.length}\nDetailed flights: ${detailed.length}\nRetries: ${timings.filter((entry) => entry.retryAttempt === 1).length}\nCache hits: ${result.timing?.providerCacheHits ?? 0}\nTotal live calls: ${timings.length}`);
  console.log(`\nElapsed: ${((performance.now() - startedAt) / 1_000).toFixed(2)}s`);
}

void run().catch((error: unknown) => {
  const failure = classifySearchFailure(error);
  console.error(`\nFINAL OUTCOME\nprovider_failure\nerrorCode: ${failure.failureCode}\nreason: ${failure.internalMessage}`);
  process.exitCode = 1;
});
