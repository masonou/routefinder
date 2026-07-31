import { NextResponse } from "next/server";

import { duffelFlightProvider } from "@/lib/providers/duffel";

export async function GET(): Promise<NextResponse> {
  try {
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
      count: offers.length,
      offers: offers.slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Duffel example error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
