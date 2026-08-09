import { NextResponse } from "next/server";

import { getDevelopmentEndpointUnavailableStatus } from "@/lib/api/developmentEndpoint";
import {
  normalizeSearchApiError,
  searchApiFlightProvider,
} from "@/lib/providers/searchApi";

const DEFAULTS = {
  origin: "BNE",
  destination: "BKK",
  date: "2026-08-17",
  adults: 1,
} as const;

function getAirportParameter(value: string | null, fallback: string): string {
  const airport = value?.trim().toUpperCase() || fallback;
  if (!/^[A-Z]{3}$/.test(airport)) {
    throw new Error("origin and destination must be three-letter airport codes.");
  }

  return airport;
}

function getDateParameter(value: string | null): string {
  const date = value?.trim() || DEFAULTS.date;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("date must be a valid YYYY-MM-DD value.");
  }

  return date;
}

function getAdultsParameter(value: string | null): number {
  const adults = value?.trim() ? Number(value) : DEFAULTS.adults;
  if (!Number.isInteger(adults) || adults < 1 || adults > 9) {
    throw new Error("adults must be an integer between 1 and 9.");
  }

  return adults;
}

export async function GET(request: Request): Promise<NextResponse> {
  const unavailableStatus = getDevelopmentEndpointUnavailableStatus();
  if (unavailableStatus) {
    return new NextResponse(null, { status: unavailableStatus });
  }

  const query = new URL(request.url).searchParams;
  let origin: string;
  let destination: string;
  let date: string;
  let adults: number;

  try {
    origin = getAirportParameter(query.get("origin"), DEFAULTS.origin);
    destination = getAirportParameter(query.get("destination"), DEFAULTS.destination);
    date = getDateParameter(query.get("date"));
    adults = getAdultsParameter(query.get("adults"));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid query parameters." },
      { status: 400 }
    );
  }

  try {
    const offers = await searchApiFlightProvider.searchOneWay({
      origin,
      destination,
      departureWindow: { start: date, end: date },
      adults,
    });

    return NextResponse.json({ count: offers.length, offers });
  } catch (error) {
    const normalizedError = normalizeSearchApiError(error);
    const status =
      normalizedError.status !== undefined &&
      normalizedError.status >= 400 &&
      normalizedError.status < 600
        ? normalizedError.status
        : 500;

    return NextResponse.json({ error: normalizedError.message }, { status });
  }
}
