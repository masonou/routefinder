import nextEnv from "@next/env";

import { discoverFlexibleHubCandidates } from "../src/lib/planner/searchDynamicRoutes.ts";
import { validateHubCandidates } from "../src/lib/planner/validateHubCandidates.ts";
import { verifyHubCandidates } from "../src/lib/planner/verifyHubCandidates.ts";
import {
  searchApiDirectDestinationsProvider,
  searchApiFlightCalendarProvider,
  searchApiFlightProvider,
} from "../src/lib/providers/searchApi.ts";
import {
  formatDateLabel,
  formatDuration,
  formatFlightDate,
  formatMoney,
} from "../src/lib/utils/formatFlight.ts";

nextEnv.loadEnvConfig(process.cwd());

const [origin, destination, departureDate] = process.argv.slice(2);

function printDetailedLeg(label: string, offer: {
  origin: string;
  destination: string;
  departureAt: string;
  durationMinutes: number;
  stops: number;
  indicativePrice: { amount: number; currency: string };
  segments: { airlineName: string }[];
}) {
  const airlines = [...new Set(offer.segments.map((segment) => segment.airlineName))].join(
    ", ",
  );
  console.log(
    `${label}: ${offer.origin} → ${offer.destination} · ${formatFlightDate(offer.departureAt)} · ${offer.stops === 0 ? "nonstop" : `${offer.stops} stop${offer.stops === 1 ? "" : "s"}`} · ${airlines} · ${formatDuration(offer.durationMinutes)} · ${formatMoney(offer.indicativePrice.amount, offer.indicativePrice.currency)}`,
  );
}

if (!origin || !destination || !departureDate) {
  console.error(
    "Usage: npm run hubs:debug -- <origin> <destination> <YYYY-MM-DD>",
  );
  process.exitCode = 1;
} else {
  const discovery = await discoverFlexibleHubCandidates(
    { origin, destination, earliestDeparture: departureDate },
    { directDestinationsProvider: searchApiDirectDestinationsProvider },
  );
  const candidates = discovery.calendarCandidates;

  console.log("\nINITIAL DEPARTURE WINDOW\n");
  discovery.departureDates.forEach((date) => console.log(formatDateLabel(date)));

  console.log("\nEXPLORE RESULTS\n");
  console.table(
    discovery.exploreResults.map((result) => ({
      departureDate: result.departureDate,
      directDestinations: result.directDestinationCount ?? 0,
      candidateCount: result.candidateCount ?? 0,
      hubs: result.hubCodes?.join(", ") ?? "",
      cacheStatus: result.cacheStatus ?? "ERROR",
      error: result.error,
    })),
  );
  if (discovery.failures.length > 0) {
    console.log(
      `Explore failures: ${discovery.failures.map((failure) => `${failure.departureDate} (${failure.message})`).join(", ")}`,
    );
  }

  console.log("\nGEOGRAPHIC CANDIDATES\n");
  console.table(
    discovery.candidates.map((candidate, index) => ({
      rank: index + 1,
      airport: candidate.airportCode,
      city: candidate.city,
      country: candidate.country,
      firstDepartureDate: candidate.firstLegDepartureDate,
      detourRatio: candidate.detourRatio,
      originToHubKm: candidate.originToHubDistanceKm,
      hubToDestinationKm: candidate.hubToDestinationDistanceKm,
      indicativeFirstLegPrice: candidate.indicativeFirstLegPrice,
      firstLegDurationMinutes: candidate.firstLegDurationMinutes,
      candidateScore: candidate.candidateScore,
    })),
  );

  console.log("\nSELECTED CALENDAR VARIANTS\n");
  console.table(
    candidates.map((candidate) => ({
      airport: candidate.airportCode,
      firstDepartureDate: candidate.firstLegDepartureDate,
      detourRatio: candidate.detourRatio,
      candidateScore: candidate.candidateScore,
    })),
  );

  const validation = await validateHubCandidates(
    { candidates, destination },
    searchApiFlightCalendarProvider,
  );

  console.log("\nCALENDAR VALIDATION\n");
  console.log(
    `Nonstop Calendar checks: ${validation.nonstopCalendarChecks}; clean hubs found: ${validation.cleanHubCount}; fallback Calendar checks: ${validation.fallbackCalendarChecks}.`,
  );
  console.table(
    validation.validatedCandidates.map((candidate, index) => ({
      rank: index + 1,
      airport: candidate.airportCode,
      type: candidate.onwardPolicy === "nonstop" ? "CLEAN" : "CONNECTING_FALLBACK",
      bestOnwardDate: candidate.bestOnwardDate,
      stayNights: candidate.bestStayNights,
      onwardPrice: candidate.bestOnwardPrice,
      estimatedTotalPrice: candidate.estimatedTotalPrice,
      validationScore: candidate.validationScore,
    })),
  );
  console.log("\nBEST VARIANT PER HUB\n");
  console.table(
    validation.topCandidates.map((candidate) => ({
      airport: candidate.airportCode,
      firstDepartureDate: candidate.firstLegDepartureDate,
      bestOnwardDate: candidate.bestOnwardDate,
      estimatedTotalPrice: candidate.estimatedTotalPrice,
    })),
  );
  if (validation.rejectedNoViableDates.length > 0) {
    console.log(
      `No viable onward Calendar dates: ${validation.rejectedNoViableDates.join(", ")}`,
    );
  }
  if (validation.failures.length > 0) {
    console.log(
      `Calendar provider failures: ${validation.failures.map((failure) => failure.airportCode).join(", ")}`,
    );
  }

  const calendarCacheHits = validation.calendarLookups.filter(
    (lookup) => lookup.cacheStatus === "HIT",
  ).length;
  const calendarCacheMisses = validation.calendarLookups.filter(
    (lookup) => lookup.cacheStatus === "MISS",
  ).length;
  const detailed = await verifyHubCandidates(
    {
      origin,
      destination,
      candidates: validation.topCandidates,
    },
    searchApiFlightProvider,
  );

  console.log("\nFINAL VERIFIED ROUTES\n");
  if (detailed.verifiedRoutes.length === 0) {
    console.log("No routes survived detailed verification.");
  }
  detailed.verifiedRoutes.forEach((route, index) => {
    console.log(`#${index + 1} ${route.hub.airportCode} — ${route.hub.city}`);
    console.log(
      `Type: ${route.onwardPolicy === "nonstop" ? "CLEAN" : "CONNECTING_FALLBACK"} · onward stops: ${route.secondLeg.stops} · score: ${route.score}`,
    );
    printDetailedLeg("First leg", route.firstLeg);
    console.log(`${route.hubStayNights} nights in ${route.hub.city}`);
    printDetailedLeg("Onward leg", route.secondLeg);
    console.log(
      `Detailed total: ${formatMoney(route.totalPrice.amount, route.totalPrice.currency)} · ${formatDuration(route.totalFlightDurationMinutes)} flying · ${route.totalStops} stop${route.totalStops === 1 ? "" : "s"} · score ${route.score}`,
    );
    const breakdown = route.scoreBreakdown;
    console.log(
      `Score breakdown: price ${breakdown.price}; duration ${breakdown.duration}; stops ${breakdown.stops}; detour ${breakdown.detour}; stay ${breakdown.stay}; final ${breakdown.final}`,
    );
    if (
      route.calendarEstimatedTotal !== undefined &&
      route.calendarDifference !== undefined
    ) {
      const differenceSign = route.calendarDifference >= 0 ? "+" : "-";
      const percent = route.calendarDifferencePercent;
      console.log(
        `Calendar estimate: ${formatMoney(route.calendarEstimatedTotal, route.totalPrice.currency)}; difference ${differenceSign}${formatMoney(Math.abs(route.calendarDifference), route.totalPrice.currency)}${percent === undefined ? "" : ` (${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%)`}`,
      );
    }
    console.log("");
  });
  if (detailed.rejected.length > 0) {
    detailed.rejected.forEach((entry) =>
      console.log(`${entry.airportCode} rejected: ${entry.reason}`),
    );
  }
  if (detailed.failures.length > 0) {
    console.log(
      `Detailed provider failures: ${detailed.failures.map((entry) => entry.airportCode).join(", ")}`,
    );
  }

  const detailedCacheHits = detailed.detailedLookups.filter(
    (lookup) => lookup.cacheStatus === "HIT",
  ).length;
  const detailedCacheMisses = detailed.detailedLookups.filter(
    (lookup) => lookup.cacheStatus === "MISS",
  ).length;
  const exploreCacheHits = discovery.exploreResults.filter(
    (result) => result.cacheStatus === "HIT",
  ).length;
  const exploreCacheMisses = discovery.exploreResults.filter(
    (result) => result.cacheStatus === "MISS",
  ).length;
  console.log(
    `SearchAPI requests: Explore ${exploreCacheMisses} (${exploreCacheHits} cache hit${exploreCacheHits === 1 ? "" : "s"}); Calendar ${calendarCacheMisses} (${calendarCacheHits} cache hit${calendarCacheHits === 1 ? "" : "s"}); Detailed Flights ${detailedCacheMisses} (${detailedCacheHits} cache hit${detailedCacheHits === 1 ? "" : "s"}); Total ${exploreCacheMisses + calendarCacheMisses + detailedCacheMisses}.`,
  );
}
