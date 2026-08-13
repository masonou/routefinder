import { createHash } from "node:crypto";

import type { BookingOption } from "../../types/booking.ts";
import { getRedisClient } from "./redis.ts";

export const BOOKING_OPTIONS_CACHE_TTL_SECONDS = 300;

export interface BookingOptionsCache {
  get(key: string): Promise<BookingOption[] | null>;
  set(key: string, value: BookingOption[], ttlSeconds: number): Promise<void>;
}

type WarningFunction = (message: string) => void;

function isBookingOption(value: unknown): value is BookingOption {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const price = record.price;
  return (
    typeof record.sellerName === "string" &&
    typeof price === "object" &&
    price !== null &&
    typeof (price as Record<string, unknown>).amount === "number" &&
    typeof (price as Record<string, unknown>).currency === "string" &&
    Array.isArray(record.flightNumbers)
  );
}

export function buildBookingOptionsCacheKey(bookingReference: string): string {
  const hash = createHash("sha256").update(bookingReference).digest("hex");
  return `slowlayover:booking:v1:${hash}`;
}

export function getBookingOptionsCache(): BookingOptionsCache | null {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  return {
    async get(key) {
      const value = await redis.get<unknown>(key);
      return Array.isArray(value) && value.every(isBookingOption) ? value : null;
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
  };
}

interface RunCachedBookingOptionsOptions {
  key: string;
  cache: BookingOptionsCache | null;
  load: () => Promise<BookingOption[]>;
  warn?: WarningFunction;
}

export interface CachedBookingOptionsResult {
  value: BookingOption[];
  cacheStatus: "HIT" | "MISS";
}

export async function runCachedBookingOptions(
  options: RunCachedBookingOptionsOptions
): Promise<CachedBookingOptionsResult> {
  const warn = options.warn ?? console.warn;

  if (options.cache) {
    try {
      const cachedValue = await options.cache.get(options.key);
      if (cachedValue) {
        return { value: cachedValue, cacheStatus: "HIT" };
      }
    } catch {
      warn("Booking-options cache read failed; proceeding without cached result.");
    }
  }

  const value = await options.load();

  if (options.cache) {
    try {
      await options.cache.set(options.key, value, BOOKING_OPTIONS_CACHE_TTL_SECONDS);
    } catch {
      warn("Booking-options cache write failed; returning fresh result.");
    }
  }

  return { value, cacheStatus: "MISS" };
}
