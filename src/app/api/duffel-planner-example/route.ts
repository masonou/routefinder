import { NextResponse } from "next/server";

import { getDevelopmentEndpointUnavailableStatus } from "@/lib/api/developmentEndpoint";
import { planTrip } from "@/lib/planner/planTrip";
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
    const itineraries = await planTrip(
      {
        origin: "BNE",
        destination: "LCA",
        departureWindow: {
          start: "2026-09-06",
          end: "2026-09-12",
        },
        arrivalWindow: {
          start: "2026-09-12",
          end: "2026-09-20",
        },
        adults: 1,
      },
      duffelFlightProvider
    );

    return NextResponse.json({
      count: itineraries.length,
      itineraries,
    });
  } catch (error) {
    const normalizedError = normalizeDuffelError(error);
    const responseStatus =
      normalizedError.status !== undefined &&
      normalizedError.status >= 400 &&
      normalizedError.status < 600
        ? normalizedError.status
        : 500;

    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json(
        {
          error: normalizedError.message,
          status: normalizedError.status,
          code: normalizedError.code,
          requestId: normalizedError.requestId,
        },
        { status: responseStatus }
      );
    }

    return NextResponse.json(
      { error: normalizedError.message },
      { status: responseStatus }
    );
  }
}
