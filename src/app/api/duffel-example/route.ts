import { NextResponse } from "next/server";

import { getDevelopmentEndpointUnavailableStatus } from "@/lib/api/developmentEndpoint";
import { getDuffelConfig } from "@/lib/providers/duffelConfig";
import {
  duffelFlightProvider,
  normalizeDuffelError,
} from "@/lib/providers/duffel";

export async function GET(): Promise<NextResponse> {
  const unavailableStatus = getDevelopmentEndpointUnavailableStatus();
  if (unavailableStatus) {
    return new NextResponse(null, { status: unavailableStatus });
  }

  try {
    const { mode: duffelMode } = getDuffelConfig();
    const offers = await duffelFlightProvider.searchOneWay({
      origin: "BNE",
      destination: "BKK",
      departureWindow: {
        start: "2026-09-09",
        end: "2026-09-09",
      },
      adults: 1,
    });

    return NextResponse.json({
      duffelMode,
      count: offers.length,
      offers: offers.slice(0, 10),
    });
  } catch (error) {
    const normalizedError = normalizeDuffelError(error);

    return NextResponse.json({ error: normalizedError.message }, { status: 500 });
  }
}
