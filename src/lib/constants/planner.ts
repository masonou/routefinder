// These simple tuning values are deliberately easy to adjust as the planner evolves.
export const MIN_HUB_STAY_NIGHTS = 2;
export const MAX_HUB_STAY_NIGHTS = 6;
export const TARGET_HUB_STAY_NIGHTS = 4;
// A journey window is deliberately bounded so a search remains an intentional
// layover journey rather than open-ended trip planning.
export const MAX_JOURNEY_WINDOW_DAYS = 14;
/** @deprecated Public searches are exact-date; retained for compatibility helpers. */
export const DEPARTURE_FLEX_DAYS = 3;

// Candidate-generation tuning. These are intentionally separate from live
// itinerary planning until candidate quality has been evaluated.
export const MAX_HUB_DETOUR_RATIO = 1.6;
export const MAX_HUB_CANDIDATES = 10;
export const MAX_CALENDAR_CANDIDATES = 8;
// Connecting onward Calendar searches only fill gaps left by clean adventures.
export const MAX_CONNECTING_FALLBACK_CALENDAR_CALLS = 4;
export const MAX_DEPARTURE_VARIANTS_PER_HUB = 2;
export const MAX_VALIDATED_HUBS = 3;
// Calendar calls are independent after Stage 1 selects its fixed eight-candidate
// budget, so launch the whole bounded clean batch together.
export const CALENDAR_VALIDATION_CONCURRENCY = 8;
export const MAX_VERIFIED_HUBS = 3;
export const MAX_ONE_STOP_RESULTS = 3;
// Each candidate verifies its two exact-date legs together. Three candidate
// workers therefore permit at most six concurrent detailed provider requests.
export const DETAILED_VERIFICATION_CONCURRENCY = 3;

// Two-stop discovery is a bounded supplementary branch. These values deliberately
// do not affect the established one-stop candidate or verification budgets.
export const TWO_STOP_MIN_DIRECT_DISTANCE_KM = 7_000;
export const TWO_STOP_MAX_PATH_DETOUR_RATIO = 2.0;
export const MAX_TWO_STOP_H1_CANDIDATES = 2;
export const MAX_H2_PER_H1 = 3;
export const MAX_TWO_STOP_PAIR_ATTEMPTS = 4;
export const MAX_TWO_STOP_RESULTS = 3;
export const MIN_TWO_STOP_STAY_NIGHTS = 2;
export const MAX_TWO_STOP_STAY_NIGHTS = 4;
export const TARGET_TWO_STOP_STAY_NIGHTS = 3;

// Verified-route quality scoring applies to the dynamic discovery pipeline.
export const VERIFIED_ROUTE_PRICE_WEIGHT = 45;
export const VERIFIED_ROUTE_DURATION_WEIGHT = 30;
export const VERIFIED_ROUTE_STOPS_WEIGHT = 10;
export const VERIFIED_ROUTE_DETOUR_WEIGHT = 10;
export const VERIFIED_ROUTE_STAY_WEIGHT = 5;
export const EXTREME_DURATION_RATIO = 1.5;
export const EXTREME_DURATION_MIN_EXTRA_MINUTES = 8 * 60;
export const EXTREME_DURATION_REQUIRED_SAVINGS_RATIO = 0.22;

// V1 searches the selected date plus three calendar days to balance useful flexibility
// with live API cost. This can become a product setting later.
export const MAX_LEG_DURATION_MINUTES = 60 * 60;
export const MAX_STOPS_PER_LEG = 3;
