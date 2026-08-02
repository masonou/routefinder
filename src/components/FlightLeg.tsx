import type { FlightOffer } from "../types/flight.ts";
import {
  formatDuration,
  formatFlightDate,
  formatFlightTime,
  formatMoney,
} from "../lib/utils/formatFlight.ts";

function getRouteLabel(offer: FlightOffer): string {
  const stops = offer.segments.map((segment) => segment.destination);
  return [offer.origin, ...stops].join(" → ");
}

function getAirlineLabel(offer: FlightOffer): string {
  return Array.from(
    new Set(offer.segments.map((segment) => segment.airlineName))
  ).join(", ");
}

function getStopLabel(stops: number): string {
  if (stops === 0) {
    return "Direct";
  }

  return `${stops} ${stops === 1 ? "stop" : "stops"}`;
}

interface FlightLegProps {
  leg: FlightOffer;
}

export function FlightLeg({ leg }: FlightLegProps) {
  return (
    <section className="space-y-1">
      <h3 className="text-base font-semibold text-stone-950">{getRouteLabel(leg)}</h3>
      <p className="text-sm text-stone-700">
        {formatFlightDate(leg.departureAt)} · {formatFlightTime(leg.departureAt)}–
        {formatFlightTime(leg.arrivalAt)}
      </p>
      <p className="text-sm text-stone-700">
        {getStopLabel(leg.stops)} · {formatDuration(leg.durationMinutes)}
      </p>
      <p className="text-sm text-stone-700">{getAirlineLabel(leg)}</p>
      <p className="text-sm font-medium text-stone-950">
        Approx. {formatMoney(leg.indicativePrice.amount, leg.indicativePrice.currency)}
      </p>
    </section>
  );
}
