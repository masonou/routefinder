import Link from "next/link";

import { ResultsClient } from "../../components/ResultsClient";
import {
  createSearchRequestFromFormValues,
  type SearchFormValues,
} from "../../lib/utils/searchValidation.ts";
import { formatDateRangeCompact } from "../../lib/utils/formatFlight.ts";

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
    departureStart: readQueryValue(params, "departureStart") ?? "",
    departureEnd: readQueryValue(params, "departureEnd") ?? "",
    arrivalStart: readQueryValue(params, "arrivalStart") ?? "",
    arrivalEnd: readQueryValue(params, "arrivalEnd") ?? "",
  };
  const request = parseRequest(values);

  if (!request) {
    return (
      <main className="min-h-screen bg-stone-50 px-4 py-10 text-stone-950 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <p className="text-xl font-semibold">Invalid search.</p>
          <Link href="/" className="text-sm text-blue-700 underline">
            New search
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-10 text-stone-950 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="space-y-2">
          <p className="text-2xl font-semibold">
            {request.origin} → {request.destination}
          </p>
          <p className="text-sm text-stone-700">via Bangkok</p>
          <p className="text-sm text-stone-700">
            Leave{" "}
            {formatDateRangeCompact(
              request.departureWindow.start,
              request.departureWindow.end
            )}{" "}
            · Arrive{" "}
            {formatDateRangeCompact(
              request.arrivalWindow.start,
              request.arrivalWindow.end
            )}
          </p>
          <Link href="/" className="text-sm text-blue-700 underline">
            New search
          </Link>
        </header>

        <ResultsClient request={request} />
      </div>
    </main>
  );
}
