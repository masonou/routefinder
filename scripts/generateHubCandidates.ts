import nextEnv from "@next/env";

import { findAirportByCode } from "../src/data/airports.ts";
import {
  buildDirectDestinationsCacheKey,
  getDirectDestinationsCache,
  runCachedDirectDestinations,
} from "../src/lib/cache/directDestinationsCache.ts";
import {
  DEPARTURE_FLEX_DAYS,
  MAX_CALENDAR_CANDIDATES,
  MAX_DEPARTURE_VARIANTS_PER_HUB,
  MAX_VERIFIED_HUBS,
  MAX_HUB_CANDIDATES,
  MAX_HUB_DETOUR_RATIO,
} from "../src/lib/constants/planner.ts";
import {
  calculateHubCandidateScoreBreakdown,
  generateHubCandidates,
  getCalendarCandidateVariantPool,
  selectCalendarCandidateVariants,
  type HubCandidate,
} from "../src/lib/planner/hubCandidates.ts";
import {
  orderAdventureItineraries,
  verifyCandidatesUntilFilled,
} from "../src/lib/planner/searchDynamicRoutes.ts";
import {
  discoverTwoStopRoutes,
  observedConnectionsByH1,
  shouldExploreTwoStopovers,
} from "../src/lib/planner/discoverTwoStopRoutes.ts";
import {
  assembleDefaultAdventurePortfolio,
  partitionOneStopAdventures,
} from "../src/lib/planner/adventurePortfolio.ts";
import { validateHubCandidates } from "../src/lib/planner/validateHubCandidates.ts";
import {
  rankVerifiedRoutes,
  type DetailedOfferTrace,
} from "../src/lib/planner/verifyHubCandidates.ts";
import {
  createSearchApiFlightProvider,
  searchApiDirectDestinationsProvider,
  type SearchApiCalendarTrace,
  type SearchApiDetailedTrace,
} from "../src/lib/providers/searchApi.ts";
import type { DirectDestination } from "../src/lib/providers/types.ts";
import { addCalendarDays, enumerateDateWindow } from "../src/lib/utils/dateWindow.ts";
import { distanceKm } from "../src/lib/utils/geography.ts";
import { formatDuration, formatMoney } from "../src/lib/utils/formatFlight.ts";
import {
  isFlightWithinDepartureWindow,
  isReasonableFlight,
} from "../src/lib/planner/filters.ts";

nextEnv.loadEnvConfig(process.cwd());

const [originArg, destinationArg, departureDate] = process.argv.slice(2);
const origin = originArg?.trim().toUpperCase();
const destination = destinationArg?.trim().toUpperCase();

interface DiagnosticCandidate extends HubCandidate {
  scoreBreakdown: ReturnType<typeof calculateHubCandidateScoreBreakdown>;
}

function compare(left: HubCandidate, right: HubCandidate): number {
  return right.candidateScore - left.candidateScore || left.detourRatio - right.detourRatio ||
    (left.indicativeFirstLegPrice ?? Infinity) - (right.indicativeFirstLegPrice ?? Infinity) ||
    (left.firstLegDurationMinutes ?? Infinity) - (right.firstLegDurationMinutes ?? Infinity) ||
    left.firstLegDepartureDate.localeCompare(right.firstLegDepartureDate) ||
    left.airportCode.localeCompare(right.airportCode);
}

function key(candidate: Pick<HubCandidate, "airportCode" | "firstLegDepartureDate">): string {
  return `${candidate.airportCode.trim().toUpperCase()}:${candidate.firstLegDepartureDate}`;
}

function uniqueHubs(candidates: Pick<HubCandidate, "airportCode">[]): number {
  return new Set(candidates.map((candidate) => candidate.airportCode.trim().toUpperCase())).size;
}

function price(candidate: Pick<HubCandidate, "indicativeFirstLegPrice" | "currency">): string {
  return candidate.indicativeFirstLegPrice === undefined
    ? ""
    : formatMoney(candidate.indicativeFirstLegPrice, candidate.currency ?? "EUR");
}

function table(title: string, rows: object[]): void {
  console.log(`\n${title}\n`);
  if (rows.length === 0) console.log("None.");
  else console.table(rows);
}

function makeCandidate(entry: DirectDestination): DiagnosticCandidate | undefined {
  if (entry.airportCode.trim().toUpperCase() === origin || entry.airportCode.trim().toUpperCase() === destination) return undefined;
  const source = findAirportByCode(origin as string);
  const target = findAirportByCode(destination as string);
  if (!source || !target) throw new Error("Origin or destination airport is not configured.");
  const sourceCoordinates = { latitude: source.latitude, longitude: source.longitude };
  const targetCoordinates = { latitude: target.latitude, longitude: target.longitude };
  const hub = { latitude: entry.latitude, longitude: entry.longitude };
  const directDistanceKm = distanceKm(sourceCoordinates, targetCoordinates);
  const originToHubDistanceKm = distanceKm(sourceCoordinates, hub);
  const hubToDestinationKm = distanceKm(hub, targetCoordinates);
  const detourRatio = (originToHubDistanceKm + hubToDestinationKm) / directDistanceKm;
  const scoreBreakdown = calculateHubCandidateScoreBreakdown(
    detourRatio, entry.flightDurationMinutes, entry.indicativePrice,
  );
  return {
    airportCode: entry.airportCode,
    city: entry.city,
    country: entry.country,
    firstLegDepartureDate: entry.outboundDate,
    latitude: entry.latitude,
    longitude: entry.longitude,
    source: "explore",
    detourRatio: Number(detourRatio.toFixed(4)),
    originToHubDistanceKm: Math.round(originToHubDistanceKm),
    hubToDestinationDistanceKm: Math.round(hubToDestinationKm),
    ...(entry.indicativePrice === undefined ? {} : { indicativeFirstLegPrice: entry.indicativePrice }),
    ...(entry.currency ? { currency: entry.currency } : {}),
    ...(entry.flightDurationMinutes === undefined ? {} : { firstLegDurationMinutes: entry.flightDurationMinutes }),
    candidateScore: scoreBreakdown.total,
    scoreBreakdown,
  };
}

// This is selectCalendarCandidateVariants before its final top-N slice.
function beforeCalendarBudget(candidates: HubCandidate[]): HubCandidate[] {
  return getCalendarCandidateVariantPool(candidates);
}

function bucketRows(candidates: DiagnosticCandidate[]) {
  const buckets = [
    ["<= 1.60", (ratio: number) => ratio <= 1.6],
    ["1.60–1.80", (ratio: number) => ratio > 1.6 && ratio <= 1.8],
    ["1.80–2.00", (ratio: number) => ratio > 1.8 && ratio <= 2],
    ["2.00–2.25", (ratio: number) => ratio > 2 && ratio <= 2.25],
    ["> 2.25", (ratio: number) => ratio > 2.25],
  ] as const;
  return buckets.map(([range, matches]) => {
    const entries = candidates.filter((candidate) => matches(candidate.detourRatio));
    return { range, variants: entries.length, uniqueHubs: uniqueHubs(entries) };
  });
}

function printNonstopMismatch(
  candidate: import("../src/lib/planner/validateHubCandidates.ts").ValidatedHubCandidate,
  rejectionReason: string,
  calendarTraces: SearchApiCalendarTrace[],
  detailedTraces: SearchApiDetailedTrace[],
  offerTraces: DetailedOfferTrace[],
  calendarLookups: import("../src/lib/planner/validateHubCandidates.ts").CalendarValidationLookup[],
): void {
  const calendarTrace = calendarTraces.find((trace) =>
    trace.request.departure_id === candidate.airportCode &&
    trace.request.arrival_id === destination &&
    trace.request.outbound_date_start === addCalendarDays(candidate.firstLegDepartureDate, 2) &&
    trace.request.stops === "nonstop",
  );
  const detailedTrace = detailedTraces.find((trace) =>
    trace.request.departure_id === candidate.airportCode &&
    trace.request.arrival_id === destination &&
    trace.request.outbound_date === candidate.bestOnwardDate,
  );
  const offerTrace = offerTraces.find((trace) =>
    trace.leg === "second" && trace.origin === candidate.airportCode &&
    trace.destination === destination && trace.departureDate === candidate.bestOnwardDate,
  );
  const offers = offerTrace?.offers ?? detailedTrace?.mappedOffers ?? [];
  const correctRoute = offers.filter((offer) =>
    offer.origin === candidate.airportCode && offer.destination === destination,
  );
  const correctRouteDate = correctRoute.filter((offer) =>
    isFlightWithinDepartureWindow(offer, {
      start: candidate.bestOnwardDate,
      end: candidate.bestOnwardDate,
    }),
  );
  const reasonable = correctRouteDate.filter(isReasonableFlight);
  const nonstop = reasonable.filter((offer) => offer.stops === 0);
  const calendarLookup = calendarLookups.find((lookup) =>
    lookup.airportCode === candidate.airportCode &&
    lookup.firstLegDepartureDate === candidate.firstLegDepartureDate &&
    lookup.onwardPolicy === "nonstop",
  );
  const detailedStopsProvided = detailedTrace?.request.stops !== undefined;
  const parserHasRejections = Object.values(detailedTrace?.parserRejections ?? {}).some(
    (count) => count > 0,
  );
  const rootCause = nonstop.length > 0
    ? "G. planner filter drops valid nonstop offer"
    : detailedTrace && !parserHasRejections
      ? "E. SearchAPI detailed result subset omission"
      : "I. inconclusive";

  console.log(`\n${"=".repeat(50)}\nNONSTOP MISMATCH — ${candidate.airportCode} → ${destination}\n${"=".repeat(50)}`);
  console.log(`Candidate first leg: ${origin} → ${candidate.airportCode} on ${candidate.firstLegDepartureDate}`);
  console.log(`Calendar selected: ${candidate.airportCode} → ${destination}; date ${candidate.bestOnwardDate}; ${candidate.bestStayNights} nights; ${formatMoney(candidate.bestOnwardPrice, candidate.currency ?? "EUR")}; policy nonstop.`);
  console.log(`Calendar window: ${addCalendarDays(candidate.firstLegDepartureDate, 2)} → ${addCalendarDays(candidate.firstLegDepartureDate, 6)}; cache ${calendarLookup?.cacheStatus ?? "unknown"}.`);
  console.log(`Calendar raw entries expose stop metadata: ${calendarTrace?.calendarEntriesContainStopMetadata ? "yes" : "no"}.`);
  console.log("Calendar request (sanitized):", calendarTrace?.request ?? {
    engine: "google_flights_calendar", flight_type: "one_way", departure_id: candidate.airportCode,
    arrival_id: destination, outbound_date: addCalendarDays(candidate.firstLegDepartureDate, 2),
    outbound_date_start: addCalendarDays(candidate.firstLegDepartureDate, 2), outbound_date_end: addCalendarDays(candidate.firstLegDepartureDate, 6), stops: "nonstop", currency: "EUR",
  });
  console.log("Detailed request (sanitized):", detailedTrace?.request ?? {
    engine: "google_flights", flight_type: "one_way", departure_id: candidate.airportCode,
    arrival_id: destination, outbound_date: candidate.bestOnwardDate, adults: "1",
    travel_class: "economy", currency: "EUR", show_cheapest_flights: "true",
  });
  console.log(`Detailed provider-level stops=nonstop: ${detailedStopsProvided ? "YES" : "NO (broad results, then local filtering)"}.`);
  console.log(`Calendar date ${candidate.bestOnwardDate}; detailed date ${offerTrace?.departureDate ?? detailedTrace?.request.outbound_date ?? candidate.bestOnwardDate}; MATCH: ${(offerTrace?.departureDate ?? detailedTrace?.request.outbound_date ?? candidate.bestOnwardDate) === candidate.bestOnwardDate ? "yes" : "no"}.`);
  console.log(`Calendar route ${candidate.airportCode} → ${destination}; detailed route ${offerTrace?.origin ?? candidate.airportCode} → ${offerTrace?.destination ?? destination}; MATCH: ${(offerTrace?.origin ?? candidate.airportCode) === candidate.airportCode && (offerTrace?.destination ?? destination) === destination ? "yes" : "no"}.`);
  table("RAW → MAPPED → PLANNER COUNTS", [{
    rawFlightGroups: detailedTrace ? Object.entries(detailedTrace.rawGroupCounts).map(([name, count]) => `${name}:${count}`).join(", ") : "not available (detailed cache hit)",
    rawFlightResults: detailedTrace?.rawFlightResults ?? "not available",
    mappedOffers: offers.length,
    correctRoute: correctRoute.length,
    correctRouteAndDate: correctRouteDate.length,
    reasonable: reasonable.length,
    nonstop: nonstop.length,
  }]);
  table("PARSER REJECTIONS", Object.entries(detailedTrace?.parserRejections ?? {}).map(([reason, count]) => ({ reason, count })));
  table("PLANNER REJECTIONS", [{
    wrongRoute: offers.length - correctRoute.length,
    wrongDate: correctRoute.length - correctRouteDate.length,
    unreasonable: correctRouteDate.length - reasonable.length,
    notNonstop: reasonable.length - nonstop.length,
  }]);
  table("REPRESENTATIVE DETAILED OFFERS", offers.slice(0, 10).map((offer) => ({
    route: offer.segments.map((segment) => segment.origin).concat(offer.destination).join(" → "),
    departure: offer.departureAt, arrival: offer.arrivalAt, duration: formatDuration(offer.durationMinutes),
    stops: offer.stops, airlines: [...new Set(offer.segments.map((segment) => segment.airlineName))].join(", "),
    price: formatMoney(offer.indicativePrice.amount, offer.indicativePrice.currency),
  })));
  console.log(`Final reason: ${rejectionReason}`);
  console.log(`Root-cause classification: ${rootCause}.`);
  console.log(`MANUAL GOOGLE FLIGHTS CHECK: ${candidate.airportCode} → ${destination}; one-way; ${candidate.bestOnwardDate}; nonstop only; economy; 1 adult.`);
}

async function run(): Promise<void> {
  if (!origin || !destination || !departureDate) {
    throw new Error("Usage: npm run hubs:debug -- <origin> <destination> <YYYY-MM-DD>");
  }
  const dates = enumerateDateWindow({ start: departureDate, end: addCalendarDays(departureDate, DEPARTURE_FLEX_DAYS) });
  const cache = getDirectDestinationsCache();
  const explore = await Promise.all(dates.map(async (date) => {
    const result = await runCachedDirectDestinations({
      key: buildDirectDestinationsCacheKey({ origin, departureDate: date }),
      cache,
      load: () => searchApiDirectDestinationsProvider.getDirectDestinations({ origin, departureDate: date }),
    });
    return { date, ...result };
  }));
  const raw = explore.flatMap((result) => result.value).map(makeCandidate)
    .filter((candidate): candidate is DiagnosticCandidate => candidate !== undefined);
  const geography = raw.filter((candidate) => candidate.detourRatio <= MAX_HUB_DETOUR_RATIO).sort(compare);
  // Uses the production generator with the already-returned Explore payload: no extra live calls.
  const perDate = await Promise.all(explore.map((result) => generateHubCandidates(
    { origin, destination, departureDate: result.date },
    { getDirectDestinations: async () => result.value },
  )));
  const stage1 = perDate.flat();
  const preBudget = beforeCalendarBudget(stage1);
  const calendar = selectCalendarCandidateVariants(stage1);
  const stage1Keys = new Set(stage1.map(key));
  const preBudgetKeys = new Set(preBudget.map(key));
  const calendarKeys = new Set(calendar.map(key));

  console.log(`\n${"=".repeat(54)}\n${origin} → ${destination} · Stage 1 diagnostic\n${"=".repeat(54)}`);
  console.log(`Rules: detour <= ${MAX_HUB_DETOUR_RATIO}; ${MAX_HUB_CANDIDATES} candidates per Explore date; ${MAX_DEPARTURE_VARIANTS_PER_HUB} variants per hub; top ${MAX_CALENDAR_CANDIDATES} to Calendar.`);
  table("EXPLORE BY DATE", explore.map((result) => ({ exploreDate: result.date, directDestinations: result.value.length, cache: result.cacheStatus })));
  console.log(`Explore aggregate: ${explore.reduce((sum, result) => sum + result.value.length, 0)} raw results; ${uniqueHubs(raw)} unique airports; ${new Set(raw.map(key)).size} unique airport/date variants.`);
  const source = findAirportByCode(origin);
  const target = findAirportByCode(destination);
  const directDistanceKm = source && target ? Math.round(distanceKm(source, target)) : 0;
  table("RAW EXPLORE CANDIDATES (NO STAGE 1 FILTERING)", raw.map((candidate) => ({
    hub: candidate.airportCode, city: candidate.city, country: candidate.country, date: candidate.firstLegDepartureDate,
    explorePrice: price(candidate), exploreDuration: candidate.firstLegDurationMinutes === undefined ? "" : formatDuration(candidate.firstLegDurationMinutes),
    originToHubKm: candidate.originToHubDistanceKm, hubToDestinationKm: candidate.hubToDestinationDistanceKm,
    directOriginToDestinationKm: directDistanceKm, detour: candidate.detourRatio,
  })));
  table("GEOGRAPHY BUCKETS", bucketRows(raw));
  table("STRONGEST REJECTED EXAMPLES (1.60–2.25)", raw.filter((candidate) => candidate.detourRatio > 1.6 && candidate.detourRatio <= 2.25)
    .sort(compare).slice(0, 30).map((candidate) => ({ hub: candidate.airportCode, city: candidate.city, country: candidate.country, date: candidate.firstLegDepartureDate, detour: candidate.detourRatio, explorePrice: price(candidate), duration: candidate.firstLegDurationMinutes === undefined ? "" : formatDuration(candidate.firstLegDurationMinutes), survives: "NO" })));
  table("STAGE 1 SCORE BREAKDOWN (EVERY CURRENT-GEOGRAPHY CANDIDATE)", geography.map((candidate, index) => ({
    geographicRank: index + 1, hub: candidate.airportCode, date: candidate.firstLegDepartureDate, detour: candidate.detourRatio,
    geography: candidate.scoreBreakdown.geography, explorePrice: candidate.scoreBreakdown.price,
    exploreDuration: candidate.scoreBreakdown.duration, total: candidate.scoreBreakdown.total,
    disposition: !stage1Keys.has(key(candidate)) ? "stage1_per_date_candidate_limit" : !preBudgetKeys.has(key(candidate)) ? "hub_variant_limit_or_duplicate" : !calendarKeys.has(key(candidate)) ? calendar.some((selected) => selected.airportCode === candidate.airportCode) ? "duplicate_hub_variant_deprioritized" : "calendar_candidate_limit" : "CALENDAR",
  })));
  table("FULL CURRENT ORDER BEFORE CALENDAR BUDGET", preBudget.map((candidate, index) => ({
    rank: index + 1, hub: candidate.airportCode, city: candidate.city, date: candidate.firstLegDepartureDate,
    detour: candidate.detourRatio, stage1Score: candidate.candidateScore, calendar: index < MAX_CALENDAR_CANDIDATES ? "YES" : "NO",
  })));
  const uniqueHubSlots = Math.min(MAX_CALENDAR_CANDIDATES, uniqueHubs(preBudget));
  const selectedCalendarKeys = new Set(calendar.map(key));
  const selectedCalendarHubs = new Set(calendar.map((candidate) => candidate.airportCode));
  table("CALENDAR SELECTION", preBudget.map((candidate, index) => ({
    rank: index + 1,
    hub: candidate.airportCode,
    date: candidate.firstLegDepartureDate,
    stage1Score: candidate.candidateScore,
    selectionReason: selectedCalendarKeys.has(key(candidate))
      ? calendar.findIndex((selected) => key(selected) === key(candidate)) < uniqueHubSlots
        ? "unique_hub_first_pass"
        : "second_variant_fill"
      : selectedCalendarHubs.has(candidate.airportCode)
        ? "duplicate_hub_variant_deprioritized"
        : "not_selected_budget",
  })));
  console.log(`Calendar budget: ${MAX_CALENDAR_CANDIDATES}; eligible unique hubs before selection: ${uniqueHubs(preBudget)}; selected variants: ${calendar.length}; selected unique hubs: ${uniqueHubs(calendar)}.`);
  console.log(`Before Calendar budget: ${uniqueHubs(preBudget)} unique hubs / ${preBudget.length} variants. After: ${uniqueHubs(calendar)} unique hubs / ${calendar.length} variants.`);
  const currentHubSet = new Set(geography.map((candidate) => candidate.airportCode));
  table("COUNTERFACTUAL GEOGRAPHY (LOCAL ONLY; NO CALENDAR CALLS)", [1.8, 2, 2.25].map((cutoff) => {
    const entries = raw.filter((candidate) => candidate.detourRatio <= cutoff);
    return { cutoff, variants: entries.length, uniqueHubs: uniqueHubs(entries), additionalHubs: [...new Set(entries.map((candidate) => candidate.airportCode))].filter((hub) => !currentHubSet.has(hub)).join(", ") };
  }));
  const currentCalendarHubs = new Set(calendar.map((candidate) => candidate.airportCode));
  table("COUNTERFACTUAL CALENDAR BUDGET (LOCAL ONLY; NO CALENDAR CALLS)", [8, 10, 12, 16].map((budget) => {
    const entries = preBudget.slice(0, budget);
    return { budget: `top ${budget}`, variants: entries.length, uniqueHubs: uniqueHubs(entries), additionalHubs: [...new Set(entries.map((candidate) => candidate.airportCode))].filter((hub) => !currentCalendarHubs.has(hub)).join(", ") };
  }));
  const calendarDeprioritizedDuplicates = preBudget.filter((candidate) =>
    !calendarKeys.has(key(candidate)) && selectedCalendarHubs.has(candidate.airportCode),
  ).length;
  const calendarBudgetExcludedHubs = preBudget.filter((candidate) =>
    !calendarKeys.has(key(candidate)) && !selectedCalendarHubs.has(candidate.airportCode),
  ).length;
  console.log(`Primary Stage 1 losses: detour_cutoff ${raw.length - geography.length}; stage1_per_date_candidate_limit ${geography.filter((candidate) => !stage1Keys.has(key(candidate))).length}; hub_variant_limit_or_duplicate ${stage1.filter((candidate) => !preBudgetKeys.has(key(candidate))).length}; duplicate_hub_variant_deprioritized ${calendarDeprioritizedDuplicates}; calendar_candidate_limit ${calendarBudgetExcludedHubs}.`);

  const calendarTraces: SearchApiCalendarTrace[] = [];
  const detailedTraces: SearchApiDetailedTrace[] = [];
  const offerTraces: DetailedOfferTrace[] = [];
  const diagnosticProvider = createSearchApiFlightProvider({
    diagnostics: {
      onCalendarTrace: (trace) => calendarTraces.push(trace),
      onDetailedTrace: (trace) => detailedTraces.push(trace),
    },
  });
  const cleanValidation = await validateHubCandidates(
    { candidates: calendar, destination },
    diagnosticProvider,
    { mode: "clean" },
  );
  const cleanDetailed = await verifyCandidatesUntilFilled(
    { origin, destination, adults: 1 },
    cleanValidation.topCandidates,
    MAX_VERIFIED_HUBS,
    new Set(),
    diagnosticProvider,
    { warn: () => {}, onDetailedOffers: (trace) => offerTraces.push(trace) },
  );
  const cleanVerifiedHubs = new Set(
    cleanDetailed.verifiedRoutes.map((route) => route.hub.airportCode.trim().toUpperCase()),
  );
  const remainingSlots = MAX_VERIFIED_HUBS - cleanDetailed.verifiedRoutes.length;
  const fallbackValidation = remainingSlots > 0
    ? await validateHubCandidates(
      {
        candidates: calendar.filter(
          (candidate) => !cleanVerifiedHubs.has(candidate.airportCode.trim().toUpperCase()),
        ),
        destination,
      },
      diagnosticProvider,
      { mode: "fallback" },
    )
    : undefined;
  const fallbackDetailed = fallbackValidation
    ? await verifyCandidatesUntilFilled(
      { origin, destination, adults: 1 },
      fallbackValidation.validatedCandidates,
      remainingSlots,
      cleanVerifiedHubs,
      diagnosticProvider,
      { warn: () => {}, onDetailedOffers: (trace) => offerTraces.push(trace) },
    )
    : { verifiedRoutes: [], rejected: [], detailedLookups: [], attemptedCandidates: 0 };
  const allVerifiedRoutes = [...cleanDetailed.verifiedRoutes, ...fallbackDetailed.verifiedRoutes];
  const finalAdventures = orderAdventureItineraries(rankVerifiedRoutes(allVerifiedRoutes).verifiedRoutes);
  const oneStopPortfolio = partitionOneStopAdventures(finalAdventures);
  const twoStopEligibility = shouldExploreTwoStopovers({
    directDistanceKm,
    cleanOneStopAdventureCount: oneStopPortfolio.clean.length,
  });
  const rejected = new Map(
    [...cleanDetailed.rejected, ...fallbackDetailed.rejected]
      .map((entry) => [entry.airportCode, entry.reason]),
  );
  table("CURRENT PIPELINE DISPOSITIONS", calendar.map((candidate) => {
    const candidateKey = key(candidate);
    const top = cleanValidation.topCandidates.some((entry) => key(entry) === candidateKey);
    const validated = cleanValidation.validatedCandidates.some((entry) => key(entry) === candidateKey);
    const verified = allVerifiedRoutes.some((route) => key(route.hub) === candidateKey);
    return {
      hub: candidate.airportCode, date: candidate.firstLegDepartureDate, detour: candidate.detourRatio,
      primaryReason: top ? rejected.has(candidate.airportCode) ? `detailed_rejected: ${rejected.get(candidate.airportCode)}` : verified ? "final_adventure" : "detailed_provider_failure_or_quality_filter" : validated ? "not_selected_for_detailed" : cleanValidation.failures.some((entry) => entry.airportCode === candidate.airportCode) ? "calendar_provider_failure" : cleanValidation.rejectedNoViableDates.includes(candidate.airportCode) ? "no_nonstop_onward_calendar" : "calendar_outcome_not_recorded",
    };
  }));
  cleanValidation.topCandidates
    .filter((candidate) => candidate.onwardPolicy === "nonstop")
    .forEach((candidate) => {
      const rejectionReason = rejected.get(candidate.airportCode);
      if (rejectionReason?.includes("No usable nonstop detailed onward flight")) {
        printNonstopMismatch(
          candidate,
          rejectionReason,
          calendarTraces,
          detailedTraces,
          offerTraces,
          cleanValidation.calendarLookups,
        );
      }
    });
  console.log("\nCURRENT PIPELINE");
  console.log(`CLEAN CALENDAR\n${cleanValidation.validatedCandidates.length} candidates`);
  console.log(`CLEAN DETAILED\nattempted: ${cleanDetailed.attemptedCandidates}\nverified: ${cleanDetailed.verifiedRoutes.length}`);
  console.log(`REMAINING SLOTS\n${remainingSlots}`);
  if (fallbackValidation) {
    console.log(`FALLBACK CALENDAR\nattempted: ${fallbackValidation.fallbackCalendarChecks}\nvalidated: ${fallbackValidation.validatedCandidates.length}`);
    console.log(`FALLBACK DETAILED\nattempted: ${fallbackDetailed.attemptedCandidates}\nverified: ${fallbackDetailed.verifiedRoutes.length}`);
  } else {
    console.log("FALLBACK\nskipped: 3 clean adventures already verified");
  }
  console.log("\nONE-STOP PORTFOLIO QUALITY");
  console.log(`clean one-stop: ${oneStopPortfolio.clean.length}\nconnecting one-stop: ${oneStopPortfolio.connecting.length}`);
  console.log("\nTWO-STOP ELIGIBILITY");
  console.log(`direct distance: ${directDistanceKm} km\nclean slots filled: ${oneStopPortfolio.clean.length} / 3\ntwo-stop slots requested: ${twoStopEligibility.slotsNeeded}\neligible: ${twoStopEligibility.eligible ? "yes" : "no"}\nreason: ${twoStopEligibility.reason}`);
  const twoStop = twoStopEligibility.eligible
    ? await discoverTwoStopRoutes(
      {
        origin,
        destination,
        adults: 1,
        h1Candidates: [
          ...cleanValidation.validatedCandidates,
          ...(fallbackValidation?.validatedCandidates ?? []),
        ],
        observedConnections: observedConnectionsByH1(offerTraces),
        slotsNeeded: twoStopEligibility.slotsNeeded,
      },
      {
        directDestinationsProvider: searchApiDirectDestinationsProvider,
        flightCalendarProvider: diagnosticProvider,
        flightProvider: diagnosticProvider,
      },
    )
    : undefined;
  if (twoStop) {
    table("H1 CANDIDATES", twoStop.h1Candidates.map((candidate) => ({
      airport: candidate.airportCode, date: candidate.firstLegDepartureDate,
      validationScore: candidate.validationScore,
    })));
    table("H2 CANDIDATES", twoStop.h2Candidates.flatMap(({ h1, candidates }) => candidates.map((candidate) => ({
      h1, airport: candidate.airportCode, source: candidate.source,
      combinedDetour: candidate.combinedPathDetourRatio,
      indicativePrice: candidate.indicativePrice ?? "",
      candidateScore: candidate.candidateScore,
    }))));
    table("PAIR VALIDATION", twoStop.itineraries.map((itinerary) => ({
      route: itinerary.legs.map((leg) => `${leg.flight.origin} → ${leg.flight.destination}`).join(" | "),
      h1Stay: itinerary.legs[0]?.stopoverAfter?.nights,
      h2Stay: itinerary.legs[1]?.stopoverAfter?.nights,
      allNonstop: itinerary.totalStops === 0 ? "yes" : "no",
    })));
    table("TWO-STOP VERIFIED", twoStop.itineraries.map((itinerary, index) => ({
      id: itinerary.id, price: formatMoney(itinerary.totalPrice.amount, itinerary.totalPrice.currency),
      flying: formatDuration(itinerary.totalFlightDurationMinutes),
      score: twoStop.scoreBreakdowns[index]?.score.final,
      scorePrice: twoStop.scoreBreakdowns[index]?.score.price,
      scoreDuration: twoStop.scoreBreakdowns[index]?.score.duration,
      scoreStops: twoStop.scoreBreakdowns[index]?.score.stops,
      scoreDetour: twoStop.scoreBreakdowns[index]?.score.detour,
      scoreStay: twoStop.scoreBreakdowns[index]?.score.stay,
    })));
  }
  const defaultPortfolio = assembleDefaultAdventurePortfolio({
    oneStopAdventures: finalAdventures,
    twoStopAdventures: twoStop?.itineraries ?? [],
  });
  console.log("\nFINAL DEFAULT PORTFOLIO");
  console.log(`clean one-stop: ${defaultPortfolio.cleanOneStop.length}\ntwo-stop: ${defaultPortfolio.twoStop.length}\nconnecting one-stop: ${defaultPortfolio.connectingOneStop.length}\ntotal adventures: ${defaultPortfolio.itineraries.length}`);
  console.log(`SUPPRESSED FROM DEFAULT\nconnecting one-stop: ${defaultPortfolio.suppressedConnectingOneStop.length}`);
  const exploreHits = explore.filter((result) => result.cacheStatus === "HIT").length;
  const calendarLookups = [
    ...cleanValidation.calendarLookups,
    ...(fallbackValidation?.calendarLookups ?? []),
  ];
  const detailedLookups = [
    ...cleanDetailed.detailedLookups,
    ...fallbackDetailed.detailedLookups,
  ];
  const calendarHits = calendarLookups.filter((lookup) => lookup.cacheStatus === "HIT").length;
  const calendarMisses = calendarLookups.filter((lookup) => lookup.cacheStatus === "MISS").length;
  const detailedHits = detailedLookups.filter((lookup) => lookup.cacheStatus === "HIT").length;
  const detailedMisses = detailedLookups.filter((lookup) => lookup.cacheStatus === "MISS").length;
  console.log("\nAPI-CALL ACCOUNTING");
  console.log(`Live SearchAPI calls: Explore ${explore.length - exploreHits}; Calendar ${calendarMisses} (${calendarHits} cache hits; failures have no cache status); Detailed ${detailedMisses} (${detailedHits} cache hits); total ${explore.length - exploreHits + calendarMisses + detailedMisses}.`);
  if (twoStop) {
    const twoStopLive = twoStop.api.h1ExploreCalls + twoStop.api.firstLegDetailedCalls +
      twoStop.api.middleCalendarCalls + twoStop.api.middleDetailedCalls +
      twoStop.api.finalCalendarCalls + twoStop.api.finalDetailedCalls;
    console.log(`Additional two-stop calls: Explore ${twoStop.api.h1ExploreCalls}; first-leg detailed ${twoStop.api.firstLegDetailedCalls}; H1→H2 Calendar ${twoStop.api.middleCalendarCalls}; H1→H2 detailed ${twoStop.api.middleDetailedCalls}; H2→destination Calendar ${twoStop.api.finalCalendarCalls}; H2→destination detailed ${twoStop.api.finalDetailedCalls}; cache hits ${twoStop.api.cacheHits}; total ${twoStopLive}.`);
    console.log(`Total live calls: ${explore.length - exploreHits + calendarMisses + detailedMisses + twoStopLive}.`);
  }
  console.log("Counterfactual cutoff and budget analysis above was local only: zero additional Calendar or Detailed calls.");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
