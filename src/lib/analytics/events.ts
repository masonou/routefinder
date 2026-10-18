import posthog from "posthog-js";

import type {
  SearchFailureCode,
  SearchFailureStage,
} from "../api/searchFailure.ts";

type SearchEventProperties = {
  origin: string;
  destination: string;
  departureDate?: string;
  arriveByDate?: string;
};

type AffiliateClickProperties = SearchEventProperties & {
  affiliate: "trip.com";
  hub: string;
  rank: number;
  totalPrice: number;
  currency: string;
  hubStayNights: number;
};

type ItineraryReactionProperties = SearchEventProperties & {
  itineraryId: string;
  resultType: "direct" | "one-stop" | "two-stop";
  rank: number;
  stopoverAirports: string[];
  stopoverNights: number[];
};

function capture(
  event: string,
  properties: Record<string, string | number | boolean | string[] | number[]>,
) {
  if (typeof window === "undefined") return;

  try {
    posthog.capture(event, properties);
  } catch {
    // Product analytics must never affect a search or affiliate navigation.
  }
}

export function trackSearchSubmitted({
  origin,
  destination,
  departureDate,
  arriveByDate,
}: SearchEventProperties) {
  const journeyWindowDays = departureDate && arriveByDate
    ? Math.round((Date.parse(`${arriveByDate}T00:00:00Z`) - Date.parse(`${departureDate}T00:00:00Z`)) / 86_400_000)
    : undefined;
  capture("search_submitted", { origin, destination, ...(departureDate ? { departure_date: departureDate } : {}), ...(arriveByDate ? { arrive_by_date: arriveByDate } : {}), ...(journeyWindowDays === undefined ? {} : { journey_window_days: journeyWindowDays }) });
}

export function trackFirstResultRendered({
  origin,
  destination,
  category,
  timeToFirstResultMs,
}: SearchEventProperties & {
  category: "direct" | "one_stop" | "two_stop";
  timeToFirstResultMs: number;
}) {
  capture("first_result_rendered", {
    origin,
    destination,
    category,
    time_to_first_result_ms: timeToFirstResultMs,
  });
}

export function trackResultsFound({
  origin,
  destination,
  resultCount,
  directCount,
  adventureCount,
  oneStopAdventureCount,
  twoStopAdventureCount,
  searchDurationMs,
}: SearchEventProperties & {
  resultCount: number;
  directCount: number;
  adventureCount: number;
  oneStopAdventureCount?: number;
  twoStopAdventureCount?: number;
  searchDurationMs?: number;
}) {
  capture("results_found", {
    origin,
    destination,
    result_count: resultCount,
    direct_count: directCount,
    adventure_count: adventureCount,
    ...(oneStopAdventureCount === undefined
      ? {}
      : { one_stop_adventure_count: oneStopAdventureCount }),
    ...(twoStopAdventureCount === undefined
      ? {}
      : { two_stop_adventure_count: twoStopAdventureCount }),
    ...(searchDurationMs === undefined
      ? {}
      : { search_duration_ms: searchDurationMs }),
  });
}

export function trackNoResults({ origin, destination }: SearchEventProperties) {
  capture("no_results", { origin, destination });
}

export function trackTwoStopExploreClicked({
  origin,
  destination,
  existingOneStopCount,
}: SearchEventProperties & { existingOneStopCount: number }) {
  capture("two_stop_explore_clicked", {
    origin,
    destination,
    existing_one_stop_count: existingOneStopCount,
  });
}

export function trackTwoStopExploreCompleted({
  origin,
  destination,
  twoStopCount,
  durationMs,
}: SearchEventProperties & { twoStopCount: number; durationMs?: number }) {
  capture("two_stop_explore_completed", {
    origin,
    destination,
    two_stop_count: twoStopCount,
    ...(durationMs === undefined ? {} : { duration_ms: durationMs }),
  });
}

export function trackTwoStopExploreFailed({
  origin,
  destination,
  failureCode,
  failureReference,
  failureStage,
}: SearchEventProperties & {
  failureCode: SearchFailureCode;
  failureReference: string;
  failureStage: SearchFailureStage;
}) {
  capture("two_stop_explore_failed", {
    origin,
    destination,
    failure_code: failureCode,
    failure_reference: failureReference,
    failure_stage: failureStage,
  });
}

export function trackSearchFailed({
  origin,
  destination,
  failureCode,
  failureReference,
  failureStage,
  retryable,
  providerStatus,
}: SearchEventProperties & {
  failureCode: SearchFailureCode;
  failureReference: string;
  failureStage: SearchFailureStage;
  retryable: boolean;
  providerStatus?: number;
}) {
  capture("search_failed", {
    origin,
    destination,
    failure_code: failureCode,
    failure_reference: failureReference,
    failure_stage: failureStage,
    retryable,
    ...(providerStatus === undefined
      ? {}
      : { provider_status: providerStatus }),
  });
}

export function trackAffiliateClick({
  affiliate,
  origin,
  destination,
  hub,
  rank,
  totalPrice,
  currency,
  hubStayNights,
}: AffiliateClickProperties) {
  capture("affiliate_click", {
    affiliate,
    origin,
    destination,
    hub,
    rank,
    total_price: totalPrice,
    currency,
    hub_stay_nights: hubStayNights,
  });
}

function trackItineraryReaction(
  event: "itinerary_liked" | "itinerary_unliked",
  {
    itineraryId,
    origin,
    destination,
    resultType,
    rank,
    stopoverAirports,
    stopoverNights,
  }: ItineraryReactionProperties,
) {
  capture(event, {
    itinerary_id: itineraryId,
    origin,
    destination,
    result_type: resultType,
    result_rank: rank,
    stopover_airports: stopoverAirports,
    stopover_nights: stopoverNights,
  });
}

export function trackItineraryLiked(properties: ItineraryReactionProperties) {
  trackItineraryReaction("itinerary_liked", properties);
}

export function trackItineraryUnliked(properties: ItineraryReactionProperties) {
  trackItineraryReaction("itinerary_unliked", properties);
}
