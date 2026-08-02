"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Itinerary } from "../types/itinerary.ts";
import type { PublicSearchRequest } from "../lib/utils/searchValidation.ts";
import { ItineraryCard } from "./ItineraryCard";

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
        if (!response.ok || !("itineraries" in payload)) {
          setErrorMessage(
            "error" in payload && payload.error ? payload.error : "Search failed."
          );
          return;
        }

        setItineraries(payload.itineraries);
      } catch (error) {
        if (!abortController.signal.aborted) {
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
    request.latestArrival,
    request.adults,
    retryToken,
  ]);

  if (errorMessage) {
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

  if (itineraries === null) {
    return (
      <p className="text-base text-stone-900" aria-live="polite">
        Finding routes…
      </p>
    );
  }

  if (itineraries.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-base font-medium text-stone-950">No routes found.</p>
        <p className="text-sm text-stone-700">Try different dates.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {itineraries.map((itinerary) => (
        <ItineraryCard key={itinerary.id} itinerary={itinerary} />
      ))}
      <p className="text-sm text-stone-600">Indicative fares only.</p>
    </div>
  );
}
