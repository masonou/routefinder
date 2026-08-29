// These simple tuning values are deliberately easy to adjust as the planner evolves.
export const MIN_HUB_STAY_NIGHTS = 2;
export const MAX_HUB_STAY_NIGHTS = 6;
export const MAX_RESULTS = 5;
export const TARGET_HUB_STAY_NIGHTS = 4;

// Candidate-generation tuning. These are intentionally separate from live
// itinerary planning until candidate quality has been evaluated.
export const MAX_HUB_DETOUR_RATIO = 1.6;
export const MAX_HUB_CANDIDATES = 10;
export const MAX_CALENDAR_CANDIDATES = 8;
// Connecting onward Calendar searches only fill gaps left by clean adventures.
export const MAX_CONNECTING_FALLBACK_CALENDAR_CALLS = 4;
export const MAX_DEPARTURE_VARIANTS_PER_HUB = 2;
export const MAX_VALIDATED_HUBS = 3;
export const CALENDAR_VALIDATION_CONCURRENCY = 3;
export const MAX_VERIFIED_HUBS = 3;
export const DETAILED_VERIFICATION_CONCURRENCY = 2;

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
export const DEPARTURE_FLEX_DAYS = 3;

export const MAX_LEG_DURATION_MINUTES = 60 * 60;
export const MAX_STOPS_PER_LEG = 3;
