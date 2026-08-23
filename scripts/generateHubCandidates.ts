import nextEnv from "@next/env";

import { generateHubCandidates } from "../src/lib/planner/hubCandidates.ts";
import { validateHubCandidates } from "../src/lib/planner/validateHubCandidates.ts";
import { verifyHubCandidates } from "../src/lib/planner/verifyHubCandidates.ts";
import {
  searchApiDirectDestinationsProvider,
  searchApiFlightCalendarProvider,
  searchApiFlightProvider,
} from "../src/lib/providers/searchApi.ts";
import { formatDuration, formatFlightDate, formatMoney } from "../src/lib/utils/formatFlight.ts";

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
  const candidates = await generateHubCandidates(
    { origin, destination, departureDate },
    searchApiDirectDestinationsProvider,
  );

  console.log("\nGEOGRAPHIC CANDIDATES\n");
  console.table(
    candidates.map((candidate, index) => ({
      rank: index + 1,
      airport: candidate.airportCode,
      city: candidate.city,
      country: candidate.country,
      detourRatio: candidate.detourRatio,
      originToHubKm: candidate.originToHubDistanceKm,
      hubToDestinationKm: candidate.hubToDestinationDistanceKm,
      indicativeFirstLegPrice: candidate.indicativeFirstLegPrice,
      firstLegDurationMinutes: candidate.firstLegDurationMinutes,
      candidateScore: candidate.candidateScore,
    })),
  );

  const validation = await validateHubCandidates(
    { candidates, destination },
    searchApiFlightCalendarProvider,
  );

  console.log("\nCALENDAR VALIDATION\n");
  console.table(
    validation.validatedCandidates.map((candidate, index) => ({
      rank: index + 1,
      airport: candidate.airportCode,
      bestOnwardDate: candidate.bestOnwardDate,
      stayNights: candidate.bestStayNights,
      onwardPrice: candidate.bestOnwardPrice,
      estimatedTotalPrice: candidate.estimatedTotalPrice,
      validationScore: candidate.validationScore,
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

  console.log("\nDETAILED VERIFICATION\n");
  if (detailed.verifiedRoutes.length === 0) {
    console.log("No routes survived detailed verification.");
  }
  detailed.verifiedRoutes.forEach((route, index) => {
    console.log(`#${index + 1} ${route.hub.airportCode} — ${route.hub.city}`);
    printDetailedLeg("First leg", route.firstLeg);
    console.log(`${route.hubStayNights} nights in ${route.hub.city}`);
    printDetailedLeg("Onward leg", route.secondLeg);
    console.log(
      `Detailed total: ${formatMoney(route.totalPrice.amount, route.totalPrice.currency)} · ${formatDuration(route.totalFlightDurationMinutes)} flying · ${route.totalStops} stop${route.totalStops === 1 ? "" : "s"} · score ${route.score}`,
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
    console.log(
      `Detailed no-offer rejections: ${detailed.rejected.map((entry) => entry.airportCode).join(", ")}`,
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
  console.log(
    `SearchAPI requests: Explore 1; Calendar ${calendarCacheMisses} (${calendarCacheHits} cache hit${calendarCacheHits === 1 ? "" : "s"}); Detailed Flights ${detailedCacheMisses} (${detailedCacheHits} cache hit${detailedCacheHits === 1 ? "" : "s"}); Total ${1 + calendarCacheMisses + detailedCacheMisses}.`,
  );
}
