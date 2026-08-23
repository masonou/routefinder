import nextEnv from "@next/env";

import { generateHubCandidates } from "../src/lib/planner/hubCandidates.ts";
import { validateHubCandidates } from "../src/lib/planner/validateHubCandidates.ts";
import {
  searchApiDirectDestinationsProvider,
  searchApiFlightCalendarProvider,
} from "../src/lib/providers/searchApi.ts";

nextEnv.loadEnvConfig(process.cwd());

const [origin, destination, departureDate] = process.argv.slice(2);

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
  console.log(
    `\nSearchAPI requests: Explore 1; Calendar ${calendarCacheMisses} (${calendarCacheHits} cache hit${calendarCacheHits === 1 ? "" : "s"}); Total ${1 + calendarCacheMisses}.`,
  );
}
