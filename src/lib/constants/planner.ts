// These simple tuning values are deliberately easy to adjust as the planner evolves.
export const MIN_HUB_STAY_NIGHTS = 2;
export const MAX_HUB_STAY_NIGHTS = 6;
export const MAX_RESULTS = 5;
export const TARGET_HUB_STAY_NIGHTS = 4;

// V1 searches the selected date plus three calendar days to balance useful flexibility
// with live API cost. This can become a product setting later.
export const DEPARTURE_FLEX_DAYS = 3;

export const MAX_LEG_DURATION_MINUTES = 60 * 60;
export const MAX_STOPS_PER_LEG = 3;
