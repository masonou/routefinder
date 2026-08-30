"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Itinerary } from "../types/itinerary.ts";
import type { PublicSearchRequest } from "../lib/utils/searchValidation.ts";
import {
  trackNoResults,
  trackResultsFound,
  trackSearchFailed,
} from "../lib/analytics/events";
import { DirectItineraryCard, ItineraryCard } from "./ItineraryCard";
import { SearchLoadingState } from "./SearchLoadingState";
import { partitionItineraries } from "./itineraryPresentation";
import { getResultsViewState } from "./resultsViewState";

interface SearchApiResponse {
  count: number;
  itineraries: Itinerary[];
}

interface SearchApiError {
  error: string;
}

interface ResultsClientProps {
  request: PublicSearchRequest;
}

function getSearchErrorType(response: Response): "server" | "validation" | "unknown" {
  if (response.ok || response.status >= 500) return "server";
  if (response.status === 400) return "validation";
  return "unknown";
}

export function ResultsClient({ request }: ResultsClientProps) {
  const [itineraries, setItineraries] = useState<Itinerary[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchResults() {
      setErrorMessage(null);
      setItineraries(null);

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          signal: abortController.signal,
        });

        const payload = (await response.json()) as SearchApiResponse | SearchApiError;
        if (!response.ok || !("itineraries" in payload) || !Array.isArray(payload.itineraries)) {
          if (!abortController.signal.aborted) {
            trackSearchFailed({
              origin: request.origin,
              destination: request.destination,
              errorType: getSearchErrorType(response),
            });
          }
          setErrorMessage(
            "error" in payload && payload.error ? payload.error : "Search failed."
          );
          return;
        }

        if (abortController.signal.aborted) return;
        if (payload.itineraries.length === 0) {
          trackNoResults({ origin: request.origin, destination: request.destination });
        } else {
          trackResultsFound({
            origin: request.origin,
            destination: request.destination,
            resultCount: payload.itineraries.length,
          });
        }
        setItineraries(payload.itineraries);
      } catch (error) {
        if (!abortController.signal.aborted) {
          trackSearchFailed({
            origin: request.origin,
            destination: request.destination,
            errorType: error instanceof TypeError ? "network" : "unknown",
          });
          setErrorMessage(error instanceof Error ? error.message : "Search failed.");
        }
      }
    }

    void fetchResults();

    return () => {
      abortController.abort();
    };
  }, [
    request,
    request.origin,
    request.destination,
    request.earliestDeparture,
    request.adults,
    retryToken,
  ]);

  const viewState = getResultsViewState(itineraries, errorMessage);

  if (viewState === "error") {
    return (
      <div className="space-y-3" aria-live="polite">
        <p className="text-base font-medium text-slate-950">
          We couldn&apos;t complete this search.
        </p>
        <p className="text-sm text-slate-600">Please try again.</p>
        <div className="flex gap-4 text-sm">
          <button
            type="button"
            onClick={() => setRetryToken((current) => current + 1)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            Try again
          </button>
          <Link href="/" className="self-center text-blue-700 underline">
            New search
          </Link>
        </div>
      </div>
    );
  }

  if (viewState === "loading") {
    return <SearchLoadingState origin={request.origin} destination={request.destination} />;
  }

  if (viewState === "empty") {
    return (
      <div className="space-y-2">
        <p className="text-base font-medium text-slate-950">
          No routes found for these dates.
        </p>
        <p className="text-sm text-slate-600">
          Try another departure date or a different airport.
        </p>
      </div>
    );
  }

  const { directOptions, adventures } = partitionItineraries(itineraries ?? []);
  const directBaseline = directOptions[0]?.itinerary;

  return (
    <div className="space-y-10">
      {directOptions.length > 0 ? (
        <section aria-labelledby="direct-option-heading" className="space-y-4">
          <h2 id="direct-option-heading" className="text-base font-semibold text-slate-950">
            Direct option
          </h2>
          {directOptions.map(({ itinerary, rank }) => (
            <DirectItineraryCard key={itinerary.id} itinerary={itinerary} rank={rank} />
          ))}
        </section>
      ) : null}

      {adventures.length > 0 ? (
        <section aria-labelledby="stopover-adventures-heading" className="space-y-4">
          <div>
            <h2 id="stopover-adventures-heading" className="text-base font-semibold text-slate-950">
              Stopover adventures
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {adventures.length} {adventures.length === 1 ? "stopover route" : "stopover routes"} found
            </p>
          </div>
          <div className="space-y-4">
            {adventures.map(({ itinerary, rank }) => (
              <ItineraryCard
                key={itinerary.id}
                itinerary={itinerary}
                rank={rank}
                directBaseline={directBaseline}
              />
            ))}
          </div>
        </section>
      ) : null}

      {directOptions.length > 0 && adventures.length === 0 ? (
        <p className="text-sm text-slate-600">
          No stopover routes met our current quality criteria for these dates.
        </p>
      ) : null}

      <p className="text-sm text-slate-500">Indicative fares only.</p>
    </div>
  );
}
