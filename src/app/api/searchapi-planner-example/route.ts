import { NextResponse } from "next/server";

import { runSearchApiPlannerExample } from "@/lib/api/searchApiPlannerExample";

export async function GET(request: Request): Promise<NextResponse> {
  const result = await runSearchApiPlannerExample(request);
  if (!("body" in result)) {
    return new NextResponse(null, { status: result.status });
  }

  return NextResponse.json(result.body, { status: result.status });
}
