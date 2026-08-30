"use client";

import { useEffect, useState } from "react";

import {
  getSearchLoadingAnnouncement,
  getNextSearchLoadingStatusIndex,
  SEARCH_LOADING_MESSAGES,
  startSearchLoadingStatusRotation,
} from "./searchLoadingPresentation";

interface SearchLoadingStateProps {
  origin: string;
  destination: string;
}

function SkeletonItinerary() {
  return (
    <div
      className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm shadow-slate-900/[0.03]"
      aria-hidden="true"
    >
      <div className="space-y-4">
        <div className="search-loading-skeleton h-4 w-3/5 rounded-full bg-slate-100" />
        <div className="search-loading-skeleton h-3 w-2/5 rounded-full bg-slate-100" />
        <div className="search-loading-skeleton h-4 w-4/5 rounded-full bg-slate-100" />
      </div>
      <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4">
        <div className="search-loading-skeleton h-4 w-20 rounded-full bg-slate-100" />
        <div className="search-loading-skeleton h-3 w-16 rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

export function SearchLoadingState({
  origin,
  destination,
}: SearchLoadingStateProps) {
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    return startSearchLoadingStatusRotation(() => {
      setStatusIndex((currentIndex) =>
        getNextSearchLoadingStatusIndex(currentIndex),
      );
    });
  }, []);

  return (
    <section
      className="mx-auto min-w-0 w-full max-w-2xl py-2 sm:py-4"
      aria-busy="true"
      aria-describedby="search-loading-announcement"
    >
      <div className="text-center">
        <h2 className="break-words text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
          Finding routes worth taking
        </h2>
        <div
          className="mx-auto mt-8 flex w-full max-w-md items-center gap-3 px-1 text-xs font-semibold tracking-[0.12em] text-slate-500"
          aria-hidden="true"
        >
          <span className="shrink-0">{origin}</span>
          <div className="relative h-px min-w-0 flex-1 bg-slate-300">
            <span className="search-loading-plane absolute top-1/2 grid size-4 -translate-y-1/2 place-items-center text-blue-700">
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="size-4"
                aria-hidden="true"
              >
                <path
                  d="M14.5 8 1.5 3.5l3 4.1L1.5 12.5 14.5 8Z"
                  fill="currentColor"
                />
              </svg>
            </span>
          </div>
          <span className="shrink-0">{destination}</span>
        </div>
        <p className="mt-6 break-words text-sm text-slate-600" aria-live="off">
          {SEARCH_LOADING_MESSAGES[statusIndex]}
        </p>
        <p
          id="search-loading-announcement"
          role="status"
          aria-live="polite"
          className="sr-only"
        >
          {getSearchLoadingAnnouncement(origin, destination)}
        </p>
      </div>

      <div className="mt-10 space-y-3" aria-hidden="true">
        <SkeletonItinerary />
        <SkeletonItinerary />
        <SkeletonItinerary />
      </div>
    </section>
  );
}
