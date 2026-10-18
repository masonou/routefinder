import { useState } from "react";

import {
  trackAffiliateClick,
  trackItineraryLiked,
  trackItineraryUnliked,
} from "../lib/analytics/events";
import { TRIP_AFFILIATE_URL } from "../lib/constants/affiliates.ts";
import { formatDuration } from "../lib/utils/formatFlight.ts";
import { calculateHubStayHours } from "../lib/planner/filters.ts";
import { getItineraryStopovers, type Itinerary } from "../types/itinerary.ts";
import { FlightLeg } from "./FlightLeg";
import {
  formatResultMoney,
  getAffiliateClickProperties,
  getConnectionSummary,
  getDirectPriceComparison,
  getItineraryReactionProperties,
  getItineraryTimeline,
  getStopoverHeadline,
} from "./itineraryPresentation";

interface ItineraryCardProps {
  itinerary: Itinerary;
  rank: number;
  directBaseline?: Itinerary;
}

function TripAffiliateLink({
  itinerary,
  rank,
}: Pick<ItineraryCardProps, "itinerary" | "rank">) {
  return (
    <a
      href={TRIP_AFFILIATE_URL}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={() => {
        trackAffiliateClick(getAffiliateClickProperties(itinerary, rank));
      }}
      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-blue-700 px-4 text-m font-semibold text-white outline-none transition hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 sm:flex-none"
    >
      Book on trip.com
    </a>
  );
}

function ItineraryActions({
  itinerary,
  rank,
}: Pick<ItineraryCardProps, "itinerary" | "rank">) {
  const [isLiked, setIsLiked] = useState(false);

  function toggleLike() {
    const nextIsLiked = !isLiked;
    const properties = getItineraryReactionProperties(itinerary, rank);
    if (nextIsLiked) {
      trackItineraryLiked(properties);
    } else {
      trackItineraryUnliked(properties);
    }
    setIsLiked(nextIsLiked);
  }

  return (
    <div className="flex items-center gap-2">
      <TripAffiliateLink itinerary={itinerary} rank={rank} />
      <button
        type="button"
        onClick={toggleLike}
        aria-label={isLiked ? "Unlike itinerary" : "Like itinerary"}
        aria-pressed={isLiked}
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg border outline-none transition focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 ${
          isLiked
            ? "border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100"
            : "border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50 hover:text-rose-600"
        }`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill={isLiked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          className="size-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.8 8.6c0 5.2-8.8 10.4-8.8 10.4S3.2 13.8 3.2 8.6a4.4 4.4 0 0 1 7.7-2.9L12 7l1.1-1.3a4.4 4.4 0 0 1 7.7 2.9Z"
          />
        </svg>
      </button>
    </div>
  );
}

function RouteTimeline({ itinerary }: Pick<ItineraryCardProps, "itinerary">) {
  const points = getItineraryTimeline(itinerary);

  return (
    <ol
      className="flex min-w-0 items-start"
      aria-label={`Route: ${points.map((point) => point.label).join(", then ")}`}
    >
      {points.map((point, index) => (
        <li
          key={`${point.code}-${index}`}
          className="flex min-w-0 flex-1 items-start last:flex-none"
        >
          <div className="min-w-0 text-center">
            <span
              className="mx-auto block size-2 rounded-full bg-blue-700"
              aria-hidden="true"
            />
            <span
              className="mt-2 block truncate text-xs font-semibold tracking-wide text-slate-700"
              title={point.label}
            >
              {point.code}
            </span>
          </div>
          {index < points.length - 1 ? (
            <span
              className="mr-1 mt-1 h-px min-w-3 flex-1 bg-slate-300"
              aria-hidden="true"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function DirectItineraryCard({
  itinerary,
  rank,
}: Omit<ItineraryCardProps, "directBaseline">) {
  return (
    <article className="grid gap-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/3 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="space-y-5">
        {itinerary.legs.map(({ flight }) => (
          <FlightLeg key={flight.id} leg={flight} />
        ))}
      </div>
      <div className="border-t border-slate-100 pt-5 lg:min-w-44 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <p className="text-2xl font-semibold tracking-tight text-slate-950">
          {formatResultMoney(
            itinerary.totalPrice.amount,
            itinerary.totalPrice.currency,
          )}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {formatDuration(itinerary.totalFlightDurationMinutes)} flying ·{" "}
          {getConnectionSummary(itinerary)}
        </p>
        <div className="mt-4">
          <ItineraryActions itinerary={itinerary} rank={rank} />
        </div>
      </div>
    </article>
  );
}

export function ItineraryCard({
  itinerary,
  rank,
  directBaseline,
}: ItineraryCardProps) {
  const stopovers = getItineraryStopovers(itinerary);
  const priceComparison = getDirectPriceComparison(itinerary, directBaseline);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/3 sm:p-6">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
            {stopovers.length === 2
              ? "Two-stop adventure"
              : "Stopover adventure"}
          </p>
          <div className="mt-3 space-y-1">
            {stopovers.map((stopover, index) =>
              index === 0 ? (
                <h3
                  key={`${stopover.airportCode}-${index}`}
                  className="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl"
                >
                  {getStopoverHeadline(stopover)}
                </h3>
              ) : (
                <h3
                  key={`${stopover.airportCode}-${index}`}
                  className="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl"
                >
                  {getStopoverHeadline(stopover)}
                </h3>
              ),
            )}
          </div>

          <div className="mt-7">
            <RouteTimeline itinerary={itinerary} />
          </div>

          <div className="mt-7 space-y-5 border-t border-slate-100 pt-5">
            {itinerary.legs.map(({ flight, stopoverAfter }, index) => (
              <div key={flight.id} className="space-y-2">
                <FlightLeg leg={flight} />
                {stopoverAfter && itinerary.legs[index + 1] ? (
                  <p className="text-sm font-medium text-blue-800">
                    {formatDuration(Math.round(calculateHubStayHours(flight, itinerary.legs[index + 1]!.flight) * 60))} in {stopoverAfter.city ?? stopoverAfter.airportCode}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="text-2xl font-semibold tracking-tight text-slate-950">
            {formatResultMoney(
              itinerary.totalPrice.amount,
              itinerary.totalPrice.currency,
            )}{" "}
            total
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {formatDuration(itinerary.totalFlightDurationMinutes)} flying
          </p>
          <p className="text-sm text-slate-600">
            {getConnectionSummary(itinerary)}
          </p>
          {priceComparison ? (
            <p className="mt-3 text-sm font-medium text-slate-800">
              {priceComparison}
            </p>
          ) : null}
          <div className="mt-5">
            <ItineraryActions itinerary={itinerary} rank={rank} />
          </div>
        </div>
      </div>
    </article>
  );
}
