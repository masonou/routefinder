"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";

import { addCalendarDays } from "@/lib/utils/dateWindow";
import { getFlexibleDepartureDates } from "@/lib/utils/flexibleDepartureDates";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const RANGE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function startOfMonth(value: string): string {
  const date = parseDate(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function addMonths(value: string, months: number): string {
  const date = parseDate(startOfMonth(value));
  date.setUTCMonth(date.getUTCMonth() + months);
  return formatDate(date);
}

function calendarDates(month: string): string[] {
  const first = parseDate(startOfMonth(month));
  const firstVisible = new Date(first);
  firstVisible.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisible);
    date.setUTCDate(firstVisible.getUTCDate() + index);
    return formatDate(date);
  });
}

function dateRangeLabel(value: string): string {
  if (!value) return "Choose earliest departure";
  const end = addCalendarDays(value, 3);
  return `${RANGE_FORMATTER.format(parseDate(value))}–${RANGE_FORMATTER.format(parseDate(end))}`;
}

export interface FlexibleDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function FlexibleDatePicker({ value, onChange, error }: FlexibleDatePickerProps) {
  const dialogId = useId();
  const today = formatDate(new Date());
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(value || today));
  const dates = useMemo(() => calendarDates(visibleMonth), [visibleMonth]);
  const flexibleDates = value ? getFlexibleDepartureDates(value) : [];
  const rangeEnd = flexibleDates.at(-1) ?? "";

  function selectDate(date: string) {
    onChange(date);
    setVisibleMonth(startOfMonth(date));
    setIsOpen(false);
  }

  function moveFocus(date: string, days: number) {
    const nextDate = shiftDate(date, days);
    if (nextDate < today) return;
    setVisibleMonth(startOfMonth(nextDate));
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-calendar-date="${nextDate}"]`)?.focus();
    });
  }

  function handleDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const movements: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in movements) {
      event.preventDefault();
      moveFocus(date, movements[event.key] as number);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(date, -parseDate(date).getUTCDay());
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(date, 6 - parseDate(date).getUTCDay());
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="relative min-w-0">
      <label className="mb-2 block text-sm font-semibold text-slate-900" htmlFor="earliest-departure">
        Earliest departure
      </label>
      <button
        id="earliest-departure"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
        aria-describedby={error ? "dates-error" : "departure-window-help"}
        onClick={() => setIsOpen((open) => !open)}
        className={`flex min-h-14 w-full items-center justify-between border bg-white px-4 text-left text-base font-medium text-slate-950 outline-none transition focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-200 ${
          error ? "border-red-600" : "border-slate-300 hover:border-slate-400"
        } rounded-lg`}
      >
        <span>{value ? DATE_FORMATTER.format(parseDate(value)) : "Select a date"}</span>
        <span aria-hidden="true" className="text-slate-500">⌄</span>
      </button>
      <p id="departure-window-help" className="mt-2 text-sm text-slate-600">
        {value ? `Searching ${dateRangeLabel(value)}.` : "We'll also search the next 3 days."}
      </p>
      {error ? <p id="dates-error" className="mt-2 text-sm text-red-700">{error}</p> : null}

      {isOpen ? (
        <div
          id={dialogId}
          role="dialog"
          aria-modal="false"
          aria-label="Choose your earliest departure date"
          onKeyDown={(event) => {
            if (event.key === "Escape") setIsOpen(false);
          }}
          className="absolute z-30 mt-2 w-full min-w-[min(100%,22rem)] border border-slate-200 bg-white p-3 shadow-xl sm:w-[22rem] sm:p-4"
        >
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={() => setVisibleMonth((month) => addMonths(month, -1))} className="grid size-10 place-items-center rounded-md text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Previous month">‹</button>
            <p className="text-sm font-semibold text-slate-950">{MONTH_FORMATTER.format(parseDate(visibleMonth))}</p>
            <button type="button" onClick={() => setVisibleMonth((month) => addMonths(month, 1))} className="grid size-10 place-items-center rounded-md text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Next month">›</button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {dates.map((date) => {
              const isSelected = date === value;
              const isInRange = Boolean(value && date > value && date <= rangeEnd);
              const isCurrentMonth = date.slice(0, 7) === visibleMonth.slice(0, 7);
              const isPast = date < today;
              return (
                <button
                  key={date}
                  data-calendar-date={date}
                  type="button"
                  disabled={isPast}
                  onClick={() => selectDate(date)}
                  onKeyDown={(event) => handleDayKeyDown(event, date)}
                  aria-label={`${DATE_FORMATTER.format(parseDate(date))}${isSelected ? ", earliest departure" : isInRange ? ", included in flexible search" : ""}`}
                  aria-pressed={isSelected}
                  className={`mx-auto grid h-10 w-10 place-items-center rounded-md text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:text-slate-300 ${
                    isSelected
                      ? "bg-blue-700 font-semibold text-white"
                      : isInRange
                        ? "w-full rounded-none bg-blue-100 font-medium text-blue-950"
                        : isCurrentMonth
                          ? "text-slate-900 hover:bg-slate-100"
                          : "text-slate-400 hover:bg-slate-100"
                  }`}
                >
                  {Number(date.slice(8, 10))}
                </button>
              );
            })}
          </div>
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
            Select the first day. The lighter dates are automatically included.
          </p>
        </div>
      ) : null}
    </div>
  );
}
