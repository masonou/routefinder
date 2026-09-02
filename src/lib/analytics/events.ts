import posthog from "posthog-js";

import type {
  SearchFailureCode,
  SearchFailureStage,
} from "../api/searchFailure.ts";

type SearchEventProperties = {
  origin: string;
  destination: string;
};

type AffiliateClickProperties = SearchEventProperties & {
  affiliate: "kiwi";
  hub: string;
  rank: number;
  totalPrice: number;
  currency: string;
  hubStayNights: number;
};

function capture(event: string, properties: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;

  try {
    posthog.capture(event, properties);
  } catch {
    // Product analytics must never affect a search or affiliate navigation.
  }
}

export function trackSearchSubmitted({ origin, destination }: SearchEventProperties) {
  capture("search_submitted", { origin, destination });
}

export function trackResultsFound({
  origin,
  destination,
  resultCount,
  directCount,
  adventureCount,
  oneStopAdventureCount,
  twoStopAdventureCount,
}: SearchEventProperties & {
  resultCount: number;
  directCount: number;
  adventureCount: number;
  oneStopAdventureCount?: number;
  twoStopAdventureCount?: number;
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
}: SearchEventProperties & { twoStopCount: number }) {
  capture("two_stop_explore_completed", {
    origin,
    destination,
    two_stop_count: twoStopCount,
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
    ...(providerStatus === undefined ? {} : { provider_status: providerStatus }),
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
