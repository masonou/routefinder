import { trackAffiliateClick } from "../lib/analytics/events";
import { KIWI_AFFILIATE_URL } from "../lib/constants/affiliates.ts";
import { formatDuration } from "../lib/utils/formatFlight.ts";
import { getItineraryStopovers, type Itinerary } from "../types/itinerary.ts";
import { FlightLeg } from "./FlightLeg";
import {
  formatResultMoney,
  getAffiliateClickProperties,
  getConnectionSummary,
  getDirectPriceComparison,
  getItineraryTimeline,
  getStopoverHeadline,
} from "./itineraryPresentation";

interface ItineraryCardProps {
  itinerary: Itinerary;
  rank: number;
  directBaseline?: Itinerary;
}

function KiwiAffiliateLink({
  itinerary,
  rank,
}: Pick<ItineraryCardProps, "itinerary" | "rank">) {
  return (
    <a
      href={KIWI_AFFILIATE_URL}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={() => {
        trackAffiliateClick(getAffiliateClickProperties(itinerary, rank));
      }}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white outline-none transition hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 sm:w-auto"
    >
      Check flights on Kiwi
    </a>
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
          <KiwiAffiliateLink itinerary={itinerary} rank={rank} />
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
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_12rem] lg:gap-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
            {stopovers.length === 2 ? "Two-stop adventure" : "Stopover adventure"}
          </p>
          <div className="mt-3 space-y-1">
            {stopovers.map((stopover, index) =>
              index === 0 ? (
                <h3
                  key={`${stopover.airportCode}-${index}`}
                  className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl"
                >
                  {getStopoverHeadline(stopover)}
                </h3>
              ) : (
                <p
                  key={`${stopover.airportCode}-${index}`}
                  className="text-base font-semibold text-slate-800"
                >
                  {getStopoverHeadline(stopover)}
                </p>
              ),
            )}
          </div>

          <div className="mt-7">
            <RouteTimeline itinerary={itinerary} />
          </div>

          <div className="mt-7 space-y-5 border-t border-slate-100 pt-5">
            {itinerary.legs.map(({ flight }) => (
              <FlightLeg key={flight.id} leg={flight} />
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
            <KiwiAffiliateLink itinerary={itinerary} rank={rank} />
          </div>
        </div>
      </div>
    </article>
  );
}
