import { NextResponse } from "next/server";

import { getDevelopmentEndpointUnavailableStatus } from "@/lib/api/developmentEndpoint";
import { runPlannerExample } from "@/lib/planner/example";

export async function GET() {
  const unavailableStatus = getDevelopmentEndpointUnavailableStatus();
  if (unavailableStatus) {
    return new NextResponse(null, { status: unavailableStatus });
  }

  try {
    const itineraries = await runPlannerExample();

    return NextResponse.json({
      count: itineraries.length,
      itineraries,
    });
  } catch (error) {
    console.error("Planner example failed:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown planner error",
      },
      { status: 500 },
    );
  }
}
