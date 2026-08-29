import { addCalendarDays } from "./dateWindow.ts";

// The homepage picker represents one selected earliest date plus the three
// automatically searched calendar days; it never represents a return date.
export function getFlexibleDepartureDates(earliestDeparture: string): string[] {
  return Array.from({ length: 4 }, (_, index) =>
    addCalendarDays(earliestDeparture, index),
  );
}
