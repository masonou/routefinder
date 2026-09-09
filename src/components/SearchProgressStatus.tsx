"use client";

import { useEffect, useState } from "react";

import {
  advanceSearchProgress,
  advanceSearchProgressForFoundRoute,
  COMPLETE_SEARCH_PROGRESS,
  getSearchProgressText,
  INITIAL_SEARCH_PROGRESS,
  SEARCH_PROGRESS_COMPLETION_COLLAPSE_MS,
  SEARCH_PROGRESS_TICK_MS,
  type SearchProgressPhase,
} from "./searchProgressPresentation";

interface SearchProgressStatusProps {
  phase: SearchProgressPhase;
  foundRouteCount: number;
}

export function SearchProgressStatus({
  phase,
  foundRouteCount,
}: SearchProgressStatusProps) {
  const [progress, setProgress] = useState(INITIAL_SEARCH_PROGRESS);
  const [completionCollapsed, setCompletionCollapsed] = useState(false);

  useEffect(() => {
    if (phase !== "searching") return;
    const intervalId = window.setInterval(() => {
      setProgress((currentProgress) => advanceSearchProgress(currentProgress));
    }, SEARCH_PROGRESS_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [phase]);

  useEffect(() => {
    if (phase !== "complete") return;
    const timeoutId = window.setTimeout(() => {
      setCompletionCollapsed(true);
    }, SEARCH_PROGRESS_COMPLETION_COLLAPSE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [phase]);

  if (phase === "failed") return null;

  const statusText = getSearchProgressText(phase, foundRouteCount);
  const visualProgress = phase === "complete"
    ? COMPLETE_SEARCH_PROGRESS
    : advanceSearchProgressForFoundRoute(progress, foundRouteCount);
  if (completionCollapsed) {
    return (
      <p className="sticky top-2 z-20 -mx-1 bg-[#f7f8fa]/95 px-1 py-2 text-sm text-slate-600 backdrop-blur-sm sm:top-4" role="status">
        {statusText}
      </p>
    );
  }

  return (
    <section
      className="sticky top-2 z-20 -mx-1 min-w-0 bg-[#f7f8fa]/95 px-1 py-2 backdrop-blur-sm sm:top-4"
      aria-busy={phase === "searching"}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-900/5">
        <p className="truncate text-sm font-medium text-slate-800" role="status">
          {statusText}
        </p>
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Search progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={visualProgress}
          aria-valuetext={phase === "complete" ? "Search complete" : "Finding routes"}
        >
          <div
            className="h-full rounded-full bg-blue-700 transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${visualProgress}%` }}
          />
        </div>
      </div>
    </section>
  );
}
