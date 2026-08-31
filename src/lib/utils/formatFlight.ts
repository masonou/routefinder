const TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function getDatePart(timestamp: string): string | null {
  const match = TIMESTAMP_PATTERN.exec(timestamp);
  return match ? match[1] : null;
}

function getTimeParts(timestamp: string): [string, string] | null {
  const match = TIMESTAMP_PATTERN.exec(timestamp);
  return match ? [match[2], match[3]] : null;
}

function parseIsoDate(date: string): Date | null {
  if (!ISO_DATE_PATTERN.test(date)) {
    return null;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return null;
  }

  return parsed;
}

export function formatFlightDate(timestamp: string): string {
  const datePart = getDatePart(timestamp);
  const date = datePart ? parseIsoDate(datePart) : null;
  if (!date) {
    return timestamp;
  }

  return `${date.getUTCDate()} ${MONTH_LABELS[date.getUTCMonth()]}`;
}

export function formatFlightTime(timestamp: string): string {
  const timeParts = getTimeParts(timestamp);
  return timeParts ? `${timeParts[0]}:${timeParts[1]}` : timestamp;
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0m";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateLabel(date: string): string {
  return formatFlightDate(`${date}T00:00:00`);
}

export function formatDateRangeCompact(start: string, end: string): string {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate) {
    return `${start}–${end}`;
  }

  const startDay = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    timeZone: "UTC",
  }).format(startDate);
  const endDay = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    timeZone: "UTC",
  }).format(endDate);
  const startMonth = MONTH_LABELS[startDate.getUTCMonth()];
  const endMonth = MONTH_LABELS[endDate.getUTCMonth()];

  if (startMonth === endMonth) {
    return `${startDay}–${endDay} ${endMonth}`;
  }

  return `${startDay} ${startMonth}–${endDay} ${endMonth}`;
}
