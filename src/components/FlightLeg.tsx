import type { FlightOffer } from "../types/flight.ts";
import { formatFlightTime } from "../lib/utils/formatFlight.ts";
import {
  formatResultMoney,
  getFlightAirlines,
  getFlightDetailLabel,
  getFlightRouteLabel,
} from "./itineraryPresentation";

interface FlightLegProps {
  leg: FlightOffer;
}

export function FlightLeg({ leg }: FlightLegProps) {
  return (
    <section className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6">
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold text-slate-950">
          {getFlightRouteLabel(leg)}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {formatFlightTime(leg.departureAt)}–{formatFlightTime(leg.arrivalAt)} · {getFlightAirlines(leg)}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-slate-600 sm:block sm:text-right">
        <p>{getFlightDetailLabel(leg)}</p>
        <p className="mt-0.5 font-medium text-slate-900">
          {formatResultMoney(leg.indicativePrice.amount, leg.indicativePrice.currency)} fare
        </p>
      </div>
    </section>
  );
}
