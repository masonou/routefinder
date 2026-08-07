// These caps protect live Duffel API usage and cost as well as server performance.
export const MAX_CONCURRENT_DUFFEL_EXACT_DATE_SEARCHES = 3;

// Two retries means at most three total attempts for a retryable exact-date failure.
// This is also a live API usage and cost control.
export const MAX_RETRYABLE_DUFFEL_RETRIES = 2;
export const MAX_DUFFEL_EXACT_DATE_ATTEMPTS =
  MAX_RETRYABLE_DUFFEL_RETRIES + 1;
