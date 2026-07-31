import type { DateWindow } from "../../types/trip.ts";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export const MAX_FLEXIBLE_SEARCH_DAYS = 14;

function parseIsoDate(date: string): Date {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new Error(`Invalid ISO date: ${date}`);
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid ISO date: ${date}`);
  }

  return parsed;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function enumerateDateWindow(window: DateWindow): string[] {
  const startDate = parseIsoDate(window.start);
  const endDate = parseIsoDate(window.end);

  if (startDate.getTime() > endDate.getTime()) {
    throw new Error(
      `Date window start ${window.start} cannot be after end ${window.end}.`
    );
  }

  const dayCount =
    Math.floor((endDate.getTime() - startDate.getTime()) / MILLISECONDS_PER_DAY) + 1;

  if (dayCount > MAX_FLEXIBLE_SEARCH_DAYS) {
    throw new Error(
      `Date window exceeds the maximum of ${MAX_FLEXIBLE_SEARCH_DAYS} days.`
    );
  }

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(startDate.getTime() + index * MILLISECONDS_PER_DAY);
    return formatIsoDate(date);
  });
}
