import Link from "next/link";

import { ResultsClient } from "../../components/ResultsClient";
import { findAirportByCode } from "../../data/airports";
import {
  createSearchRequestFromFormValues,
  type SearchFormValues,
} from "../../lib/utils/searchValidation.ts";
import { formatDateRangeCompact } from "../../lib/utils/formatFlight.ts";
import { getFlexibleDepartureDates } from "../../lib/utils/flexibleDepartureDates.ts";

type ResultsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readQueryValue(
  params: Record<string, string | string[] | undefined>,
  key: string
): string | null {
  const value = params[key];
  return typeof value === "string" ? value : null;
}

function parseRequest(values: SearchFormValues) {
  try {
    return createSearchRequestFromFormValues(values);
  } catch {
    return null;
  }
}

export default async function ResultsPage({ searchParams }: ResultsPageProps) {
  const params = await searchParams;

  const values: SearchFormValues = {
    origin: readQueryValue(params, "origin") ?? "",
    destination: readQueryValue(params, "destination") ?? "",
    earliestDeparture: readQueryValue(params, "earliestDeparture") ?? "",
  };
  const request = parseRequest(values);

  if (!request) {
    return (
      <main className="min-h-svh bg-[#f7f8fa] px-4 py-10 text-slate-950 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <p className="text-xl font-semibold">Invalid search.</p>
          <Link href="/" className="text-sm text-blue-700 underline">
            New search
          </Link>
        </div>
      </main>
    );
  }

  const origin = findAirportByCode(request.origin);
  const destination = findAirportByCode(request.destination);
  const departureDates = getFlexibleDepartureDates(request.earliestDeparture);

  return (
    <main className="min-h-svh bg-[#f7f8fa] px-4 py-10 text-slate-950 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="min-w-0 space-y-4">
          <Link
            href="/"
            className="inline-flex text-lg font-semibold tracking-tight text-slate-950"
          >
            Slow Layover
          </Link>
          <div className="space-y-2">
            <h1 className="wrap-break-word text-2xl font-semibold">
              {origin ? `${origin.city} (${origin.iataCode})` : request.origin} → {" "}
              {destination
                ? `${destination.city} (${destination.iataCode})`
                : request.destination}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 text-sm text-slate-600">
              <span>
                Departing {formatDateRangeCompact(request.earliestDeparture, departureDates.at(-1) ?? request.earliestDeparture)}
              </span>
              <span aria-hidden="true">·</span>
              <span>One-way</span>
            </div>
            <Link href="/" className="inline-flex text-sm text-blue-700 underline underline-offset-2">
              New search
            </Link>
          </div>
        </header>

        <ResultsClient request={request} />
      </div>
    </main>
  );
}
