import posthog from "posthog-js";

type SearchEventProperties = {
  origin: string;
  destination: string;
};

type SearchErrorType = "network" | "server" | "validation" | "unknown";

type AffiliateClickProperties = SearchEventProperties & {
  affiliate: "kiwi";
  hub: string;
  rank: number;
  totalPrice: number;
  currency: string;
  hubStayNights: number;
};

function capture(event: string, properties: Record<string, string | number>) {
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
}: SearchEventProperties & { resultCount: number }) {
  capture("results_found", {
    origin,
    destination,
    result_count: resultCount,
  });
}

export function trackNoResults({ origin, destination }: SearchEventProperties) {
  capture("no_results", { origin, destination });
}

export function trackSearchFailed({
  origin,
  destination,
  errorType,
}: SearchEventProperties & { errorType?: SearchErrorType }) {
  capture("search_failed", {
    origin,
    destination,
    ...(errorType ? { error_type: errorType } : {}),
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
