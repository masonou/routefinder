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
import { ItineraryCard } from "./ItineraryCard";
import { SearchLoadingState } from "./SearchLoadingState";
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
        <p className="text-base font-medium text-stone-950">Search failed.</p>
        <p className="text-sm text-stone-700">{errorMessage}</p>
        <div className="flex gap-4 text-sm">
          <button
            type="button"
            onClick={() => setRetryToken((current) => current + 1)}
            className="rounded-md border border-stone-300 px-3 py-2 text-stone-900"
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
        <p className="text-base font-medium text-stone-950">No routes found.</p>
        <p className="text-sm text-stone-700">Try different dates.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(itineraries ?? []).map((itinerary, index) => (
        <ItineraryCard key={itinerary.id} itinerary={itinerary} rank={index + 1} />
      ))}
      <p className="text-sm text-stone-600">Indicative fares only.</p>
    </div>
  );
}
