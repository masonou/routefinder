import { NextResponse } from "next/server";

import { runBookingOptionsRequest } from "@/lib/api/bookingOptionsRequest";

export async function POST(request: Request): Promise<NextResponse> {
  const result = await runBookingOptionsRequest(request);
  return NextResponse.json(result.body, { status: result.status });
}
