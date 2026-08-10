import { NextResponse } from "next/server";

import { runSearchRequest } from "@/lib/api/searchRequest";

export async function POST(request: Request): Promise<NextResponse> {
  const result = await runSearchRequest(request);
  if ("headers" in result) {
    return NextResponse.json(result.body, { status: result.status, headers: result.headers });
  }

  return NextResponse.json(result.body, { status: result.status });
}
