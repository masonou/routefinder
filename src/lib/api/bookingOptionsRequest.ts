import {
  buildBookingOptionsCacheKey,
  getBookingOptionsCache,
  runCachedBookingOptions,
} from "../cache/bookingOptionsCache.ts";
import { searchApiBookingOptionsProvider } from "../providers/searchApi.ts";
import { SearchValidationError } from "../utils/searchValidation.ts";
import { validateBookingOptionsApiBody } from "../utils/bookingValidation.ts";
import type { BookingOptionsCache } from "../cache/bookingOptionsCache.ts";
import type { BookingOptionsProvider } from "../providers/types.ts";
import type { BookingOption } from "../../types/booking.ts";

export interface BookingOptionsRequestDependencies {
  cache?: BookingOptionsCache | null;
  provider?: BookingOptionsProvider;
}

export type BookingOptionsRequestResult =
  | { status: 200; body: { options: BookingOption[] } }
  | { status: 400 | 500; body: { error: string } };

export async function runBookingOptionsRequest(
  request: Request,
  dependencies: BookingOptionsRequestDependencies = {},
): Promise<BookingOptionsRequestResult> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { status: 400, body: { error: "Invalid JSON." } };
  }

  try {
    const bookingRequest = validateBookingOptionsApiBody(body);
    const cache =
      dependencies.cache === undefined
        ? getBookingOptionsCache()
        : dependencies.cache;
    const result = await runCachedBookingOptions({
      key: buildBookingOptionsCacheKey(bookingRequest.bookingReference),
      cache,
      load: () =>
        (
          dependencies.provider ?? searchApiBookingOptionsProvider
        ).getBookingOptions(bookingRequest),
    });

    return { status: 200, body: { options: result.value } };
  } catch (error) {
    if (error instanceof SearchValidationError) {
      return { status: 400, body: { error: error.message } };
    }

    return {
      status: 500,
      body: {
        error: "Booking options are currently unavailable. Please try again.",
      },
    };
  }
}
