import { NextResponse } from "next/server";

import { planTrip } from "@/lib/planner/planTrip";
import {
  duffelFlightProvider,
  normalizeDuffelError,
} from "@/lib/providers/duffel";
import {
  SearchValidationError,
  toTripRequest,
  validateSearchApiBody,
} from "@/lib/utils/searchValidation";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const searchRequest = validateSearchApiBody(body);
    const tripRequest = toTripRequest(searchRequest);
    const itineraries = await planTrip(tripRequest, duffelFlightProvider);

    return NextResponse.json({
      count: itineraries.length,
      itineraries,
    });
  } catch (error) {
    if (error instanceof SearchValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const normalizedError = normalizeDuffelError(error);
    const safeBody =
      process.env.NODE_ENV !== "production"
        ? {
            error: normalizedError.message,
            status: normalizedError.status,
            code: normalizedError.code,
            requestId: normalizedError.requestId,
          }
        : {
            error: normalizedError.message,
          };

    return NextResponse.json(safeBody, { status: 500 });
  }
}
