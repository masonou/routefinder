"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { Itinerary } from "../types/itinerary.ts";
import type { SearchProgressEvent, TwoStopDiscoveryMetadata } from "../types/search.ts";
import type { PublicSearchRequest } from "../lib/utils/searchValidation.ts";
import type {
  SearchFailureCode,
  SearchFailureStage,
} from "../lib/api/searchFailure.ts";
import {
  trackNoResults,
  trackResultsFound,
  trackSearchFailed,
  trackTwoStopExploreClicked,
  trackTwoStopExploreCompleted,
  trackTwoStopExploreFailed,
  trackFirstResultRendered,
} from "../lib/analytics/events";
import { consumeNdjsonBuffer } from "../lib/api/searchStream";
import { DirectItineraryCard, ItineraryCard } from "./ItineraryCard";
import { SearchProgressStatus } from "./SearchProgressStatus";
import {
  getInitialAdventureVisibility,
  isDirectBaseline,
  partitionItineraries,
} from "./itineraryPresentation";
import { getResultsViewState } from "./resultsViewState";
import { formatSearchFailureReference } from "./searchFailureReference";
import {
  countUniqueItineraries,
  shouldHandleSearchProgressEvent,
  type SearchProgressPhase,
} from "./searchProgressPresentation";

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

type TwoStopExploreState = "idle" | "loading" | "empty" | "error";

async function readSearchProgress(
  response: Response,
  onEvent: (event: SearchProgressEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error("Search stream was unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer = consumeNdjsonBuffer(buffer + decoder.decode(value, { stream: true }), onEvent);
  }
  buffer = consumeNdjsonBuffer(buffer + decoder.decode(), onEvent);
  if (buffer.trim()) consumeNdjsonBuffer(`${buffer}\n`, onEvent);
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

function deduplicateItineraries(itineraries: Itinerary[]): Itinerary[] {
  const seen = new Set<string>();
  return itineraries.filter((itinerary) => {
    if (seen.has(itinerary.id)) return false;
    seen.add(itinerary.id);
    return true;
  });
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
  const [searchActive, setSearchActive] = useState(true);
  const [searchProgressPhase, setSearchProgressPhase] = useState<SearchProgressPhase>("searching");
  const [partialFailure, setPartialFailure] = useState<SearchFailureState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<SearchFailureState | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [showAllOneStop, setShowAllOneStop] = useState(false);
  const [showAllTwoStop, setShowAllTwoStop] = useState(false);
  const [twoStopDiscovery, setTwoStopDiscovery] = useState<TwoStopDiscoveryMetadata | null>(null);
  const [twoStopExploreState, setTwoStopExploreState] = useState<TwoStopExploreState>("idle");
  const [twoStopExploreFailure, setTwoStopExploreFailure] = useState<SearchFailureState | null>(null);
  const activeSearchId = useRef(0);

  useEffect(() => {
    const abortController = new AbortController();
    const searchId = activeSearchId.current + 1;
    activeSearchId.current = searchId;

    function isCurrentSearch(): boolean {
      return shouldHandleSearchProgressEvent(
        activeSearchId.current,
        searchId,
        abortController.signal.aborted,
      );
    }

    async function fetchResults() {
      const startedAt = performance.now();
      setErrorMessage(null);
      setFailure(null);
      setPartialFailure(null);
      setSearchActive(true);
      setSearchProgressPhase("searching");
      setItineraries(null);
      setShowAllOneStop(false);
      setShowAllTwoStop(false);
      setTwoStopDiscovery(null);
      setTwoStopExploreState("idle");
      setTwoStopExploreFailure(null);

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          signal: abortController.signal,
        });

        let completed = false;
        let firstResultSeen = false;
        await readSearchProgress(response, (event) => {
          if (!isCurrentSearch()) return;
          if (event.type === "search_started") {
            setSearchProgressPhase("searching");
            return;
          }
          if (event.type === "itinerary_found") {
            if (!firstResultSeen) {
              firstResultSeen = true;
              trackFirstResultRendered({
                origin: request.origin, destination: request.destination,
                category: event.category,
                timeToFirstResultMs: Math.round(performance.now() - startedAt),
              });
            }
            setItineraries((current) => deduplicateItineraries([...(current ?? []), event.itinerary]));
            return;
          }
          if (event.type === "search_snapshot" || event.type === "search_complete") {
            const payload = event.result;
            setItineraries(deduplicateItineraries(payload.itineraries));
            setTwoStopDiscovery(payload.twoStopDiscovery);
            if (event.type !== "search_complete") return;
            completed = true;
            setSearchActive(false);
            setSearchProgressPhase("complete");
            if (payload.itineraries.length === 0) {
              trackNoResults({ origin: request.origin, destination: request.destination });
            } else {
              const { directCount, adventureCount, oneStopAdventureCount, twoStopAdventureCount } = countResultTypes(payload.itineraries);
              trackResultsFound({ origin: request.origin, destination: request.destination, resultCount: payload.itineraries.length, directCount, adventureCount, oneStopAdventureCount, twoStopAdventureCount, searchDurationMs: Math.round(performance.now() - startedAt) });
            }
            return;
          }
          if (event.type === "search_failed") {
            const failureState = toFailureState(event as SearchApiError);
            setSearchActive(false);
            setSearchProgressPhase("failed");
            setItineraries((current) => {
              if (current?.length) setPartialFailure(failureState);
              else {
                setFailure(failureState);
                setErrorMessage(event.error);
              }
              return current;
            });
          }
        });
        if (!completed && isCurrentSearch()) {
          throw new Error("Search stream ended before completion.");
        }
      } catch (error) {
        if (isCurrentSearch()) {
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
          setSearchActive(false);
          setSearchProgressPhase("failed");
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

  async function exploreTwoStopAdventures() {
    if (twoStopExploreState === "loading") return;

    const startedAt = performance.now();
    const existingOneStopCount = countResultTypes(itineraries ?? []).oneStopAdventureCount;
    trackTwoStopExploreClicked({
      origin: request.origin,
      destination: request.destination,
      existingOneStopCount,
    });
    setTwoStopExploreState("loading");
    setTwoStopExploreFailure(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, forceTwoStop: true }),
      });
      let completed = false;
      await readSearchProgress(response, (event) => {
        if (event.type === "itinerary_found" && event.category === "two_stop") {
          setItineraries((current) => deduplicateItineraries([...(current ?? []), event.itinerary]));
          return;
        }
        if (event.type === "search_complete" || event.type === "search_snapshot") {
          const expandedItineraries = deduplicateItineraries(event.result.itineraries);
          const twoStopCount = countResultTypes(expandedItineraries).twoStopAdventureCount;
          setItineraries(expandedItineraries);
          setTwoStopDiscovery(event.result.twoStopDiscovery);
          if (event.type === "search_complete") {
            completed = true;
            setTwoStopExploreState(twoStopCount === 0 ? "empty" : "idle");
            trackTwoStopExploreCompleted({ origin: request.origin, destination: request.destination, twoStopCount, durationMs: Math.round(performance.now() - startedAt) });
          }
          return;
        }
        if (event.type === "search_failed") {
          const failureState = toFailureState(event as SearchApiError);
          trackTwoStopExploreFailed({ origin: request.origin, destination: request.destination, failureCode: failureState.code, failureReference: failureState.reference, failureStage: failureState.stage });
          setTwoStopExploreFailure(failureState);
          setTwoStopExploreState("error");
        }
      });
      if (!completed) throw new Error("Two-stop search stream ended before completion.");
    } catch (error) {
      const failureState = createClientFailure(
        error instanceof TypeError ? "SL-REQUEST-NETWORK" : "SL-SEARCH-UNKNOWN",
        error instanceof TypeError ? "request" : "unknown",
      );
      trackTwoStopExploreFailed({
        origin: request.origin,
        destination: request.destination,
        failureCode: failureState.code,
        failureReference: failureState.reference,
        failureStage: failureState.stage,
      });
      setTwoStopExploreFailure(failureState);
      setTwoStopExploreState("error");
    }
  }

  const viewState = getResultsViewState(itineraries, errorMessage);
  const foundRouteCount = countUniqueItineraries(itineraries ?? []);
  const searchProgressKey = [
    request.origin,
    request.destination,
    request.earliestDeparture,
    request.adults,
    retryToken,
  ].join(":");
  const searchProgressStatus = (
    <SearchProgressStatus
      key={searchProgressKey}
      phase={searchProgressPhase}
      foundRouteCount={foundRouteCount}
    />
  );

  if (viewState === "error") {
    return (
      <SearchFailurePanel
        failureReference={failure?.reference ?? null}
        onRetry={() => {
          setSearchProgressPhase("searching");
          setRetryToken((current) => current + 1);
        }}
      />
    );
  }

  if (viewState === "loading" || (searchActive && (itineraries?.length ?? 0) === 0)) {
    return searchProgressStatus;
  }

  if (viewState === "empty") {
    return (
      <div className="space-y-4">
        {searchProgressStatus}
        <div className="space-y-2">
          <p className="text-base font-medium text-slate-950">
            No routes found for these dates.
          </p>
          <p className="text-sm text-slate-600">
            Try another departure date or a different airport.
          </p>
        </div>
      </div>
    );
  }

  const { directOptions, oneStopAdventures, twoStopAdventures } = partitionItineraries(itineraries ?? []);
  const directBaseline = directOptions[0]?.itinerary;
  const initialVisibility = getInitialAdventureVisibility(
    oneStopAdventures.length,
    twoStopAdventures.length,
  );
  const visibleOneStop = showAllOneStop
    ? oneStopAdventures
    : oneStopAdventures.slice(0, initialVisibility.oneStop);
  const visibleTwoStop = showAllTwoStop
    ? twoStopAdventures
    : twoStopAdventures.slice(0, initialVisibility.twoStop);
  const hiddenOneStopCount = oneStopAdventures.length - visibleOneStop.length;
  const hiddenTwoStopCount = twoStopAdventures.length - visibleTwoStop.length;

  return (
    <div className="space-y-10">
      {searchProgressStatus}
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
            {visibleOneStop.map(({ itinerary, rank }) => (
              <ItineraryCard
                key={itinerary.id}
                itinerary={itinerary}
                rank={rank}
                directBaseline={directBaseline}
              />
            ))}
          </div>
          {hiddenOneStopCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAllOneStop(true)}
              className="min-h-11 w-full rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-900 outline-none hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-blue-700 sm:w-auto"
            >
              {hiddenOneStopCount === 1 ? "Show 1 more" : "Show more"}
            </button>
          ) : null}
          {twoStopDiscovery?.canExplore ? (
            <div className="space-y-2" aria-live="polite">
              {twoStopExploreState === "loading" ? (
                <p className="text-sm text-slate-600">Exploring two-stop adventures…</p>
              ) : null}
              {twoStopExploreState === "error" ? (
                <div className="space-y-2 text-sm text-slate-600">
                  <p>We couldn&apos;t explore more routes right now.</p>
                  {twoStopExploreFailure ? (
                    <p className="font-mono text-xs text-slate-500">
                      {formatSearchFailureReference(twoStopExploreFailure.reference)}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void exploreTwoStopAdventures()}
                disabled={twoStopExploreState === "loading"}
                className="min-h-11 w-full rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-900 outline-none hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {twoStopExploreState === "error" ? "Try again" : "Explore two-stop adventures"}
              </button>
            </div>
          ) : null}
          {twoStopExploreState === "empty" && !twoStopDiscovery?.canExplore ? (
            <p className="text-sm text-slate-600" aria-live="polite">
              No additional two-stop adventures found for these dates.
            </p>
          ) : null}
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
            {visibleTwoStop.map(({ itinerary, rank }) => (
              <ItineraryCard
                key={itinerary.id}
                itinerary={itinerary}
                rank={rank}
                directBaseline={directBaseline}
              />
            ))}
          </div>
          {hiddenTwoStopCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAllTwoStop(true)}
              className="min-h-11 w-full rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-900 outline-none hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-blue-700 sm:w-auto"
            >
              {hiddenTwoStopCount === 1 ? "Show 1 more" : "Show more"}
            </button>
          ) : null}
        </section>
      ) : null}

      {directOptions.length > 0 && oneStopAdventures.length === 0 && twoStopAdventures.length === 0 ? (
        <p className="text-sm text-slate-600">
          No stopover routes met our current quality criteria for these dates.
        </p>
      ) : null}

      {partialFailure ? (
        <p className="text-sm text-slate-600" aria-live="polite">
          We found some routes, but couldn&apos;t finish exploring all possibilities.
          {partialFailure.reference ? ` ${formatSearchFailureReference(partialFailure.reference)}` : ""}
        </p>
      ) : null}

      <p className="text-sm text-slate-500">Indicative fares only.</p>
    </div>
  );
}
