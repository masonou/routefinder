"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Itinerary } from "../types/itinerary.ts";
import type { PublicSearchRequest } from "../lib/utils/searchValidation.ts";
import type {
  SearchFailureCode,
  SearchFailureStage,
} from "../lib/api/searchFailure.ts";
import {
  trackNoResults,
  trackResultsFound,
  trackSearchFailed,
} from "../lib/analytics/events";
import { DirectItineraryCard, ItineraryCard } from "./ItineraryCard";
import { SearchLoadingState } from "./SearchLoadingState";
import { isDirectBaseline, partitionItineraries } from "./itineraryPresentation";
import { getResultsViewState } from "./resultsViewState";
import { formatSearchFailureReference } from "./searchFailureReference";

interface SearchApiResponse {
  count: number;
  itineraries: Itinerary[];
}

interface SearchApiError {
  error: string;
  failureCode?: SearchFailureCode;
  failureReference?: string;
  failureStage?: SearchFailureStage;
  retryable?: boolean;
  providerStatus?: number;
}

interface ResultsClientProps {
  request: PublicSearchRequest;
}

interface SearchFailurePanelProps {
  failureReference: string | null;
  onRetry: () => void;
}

interface SearchFailureState {
  code: SearchFailureCode;
  reference: string;
  stage: SearchFailureStage;
  retryable: boolean;
  providerStatus?: number;
}

function createClientFailure(
  code: "SL-REQUEST-NETWORK" | "SL-SEARCH-UNKNOWN",
  stage: SearchFailureStage,
): SearchFailureState {
  const suffix = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return {
    code,
    reference: `${code}-${suffix}`,
    stage,
    retryable: true,
  };
}

function toFailureState(payload: SearchApiError): SearchFailureState {
  if (
    payload.failureCode &&
    payload.failureReference &&
    payload.failureStage &&
    typeof payload.retryable === "boolean"
  ) {
    return {
      code: payload.failureCode,
      reference: payload.failureReference,
      stage: payload.failureStage,
      retryable: payload.retryable,
      ...(payload.providerStatus === undefined ? {} : { providerStatus: payload.providerStatus }),
    };
  }
  return createClientFailure("SL-SEARCH-UNKNOWN", "unknown");
}

function countResultTypes(itineraries: Itinerary[]) {
  const directCount = itineraries.filter(isDirectBaseline).length;
  const oneStopAdventureCount = itineraries.filter(
    (itinerary) => itinerary.legs.filter((leg) => leg.stopoverAfter).length === 1,
  ).length;
  const twoStopAdventureCount = itineraries.filter(
    (itinerary) => itinerary.legs.filter((leg) => leg.stopoverAfter).length === 2,
  ).length;
  return {
    directCount,
    adventureCount: oneStopAdventureCount + twoStopAdventureCount,
    oneStopAdventureCount,
    twoStopAdventureCount,
  };
}

export function SearchFailurePanel({
  failureReference,
  onRetry,
}: SearchFailurePanelProps) {
  const referenceText = formatSearchFailureReference(failureReference);

  return (
    <div className="space-y-3" aria-live="polite">
      <p className="text-base font-medium text-slate-950">
        We couldn&apos;t complete this search.
      </p>
      <p className="text-sm text-slate-600">Please try again.</p>
      {referenceText ? (
        <p className="font-mono text-xs text-slate-500" aria-label={`Failure reference: ${failureReference}`}>
          {referenceText}
        </p>
      ) : null}
      <div className="flex gap-4 text-sm">
        <button
          type="button"
          onClick={onRetry}
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

export function ResultsClient({ request }: ResultsClientProps) {
  const [itineraries, setItineraries] = useState<Itinerary[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<SearchFailureState | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchResults() {
      setErrorMessage(null);
      setFailure(null);
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
            const failureState = toFailureState(
              "error" in payload ? payload : { error: "Search failed." },
            );
            trackSearchFailed({
              origin: request.origin,
              destination: request.destination,
              failureCode: failureState.code,
              failureReference: failureState.reference,
              failureStage: failureState.stage,
              retryable: failureState.retryable,
              ...(failureState.providerStatus === undefined
                ? {}
                : { providerStatus: failureState.providerStatus }),
            });
            setFailure(failureState);
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
          const {
            directCount, adventureCount, oneStopAdventureCount, twoStopAdventureCount,
          } = countResultTypes(payload.itineraries);
          trackResultsFound({
            origin: request.origin,
            destination: request.destination,
            resultCount: payload.itineraries.length,
            directCount,
            adventureCount,
            oneStopAdventureCount,
            twoStopAdventureCount,
          });
        }
        setItineraries(payload.itineraries);
      } catch (error) {
        if (!abortController.signal.aborted) {
          const failureState = createClientFailure(
            error instanceof TypeError ? "SL-REQUEST-NETWORK" : "SL-SEARCH-UNKNOWN",
            error instanceof TypeError ? "request" : "unknown",
          );
          trackSearchFailed({
            origin: request.origin,
            destination: request.destination,
            failureCode: failureState.code,
            failureReference: failureState.reference,
            failureStage: failureState.stage,
            retryable: failureState.retryable,
          });
          setFailure(failureState);
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
      <SearchFailurePanel
        failureReference={failure?.reference ?? null}
        onRetry={() => setRetryToken((current) => current + 1)}
      />
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

  const { directOptions, oneStopAdventures, twoStopAdventures } = partitionItineraries(itineraries ?? []);
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

      {oneStopAdventures.length > 0 ? (
        <section aria-labelledby="stopover-adventures-heading" className="space-y-4">
          <div>
            <h2 id="stopover-adventures-heading" className="text-base font-semibold text-slate-950">
              Stopover adventures
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {oneStopAdventures.length} {oneStopAdventures.length === 1 ? "stopover route" : "stopover routes"} found
            </p>
          </div>
          <div className="space-y-4">
            {oneStopAdventures.map(({ itinerary, rank }) => (
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

      {twoStopAdventures.length > 0 ? (
        <section aria-labelledby="two-stop-adventures-heading" className="space-y-4">
          <div>
            <h2 id="two-stop-adventures-heading" className="text-base font-semibold text-slate-950">
              Two-stop adventures
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {twoStopAdventures.length} {twoStopAdventures.length === 1 ? "two-stop adventure" : "two-stop adventures"} found
            </p>
          </div>
          <div className="space-y-4">
            {twoStopAdventures.map(({ itinerary, rank }) => (
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

      {directOptions.length > 0 && oneStopAdventures.length === 0 && twoStopAdventures.length === 0 ? (
        <p className="text-sm text-slate-600">
          No stopover routes met our current quality criteria for these dates.
        </p>
      ) : null}

      <p className="text-sm text-slate-500">Indicative fares only.</p>
    </div>
  );
}
