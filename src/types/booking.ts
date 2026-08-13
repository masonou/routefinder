import type { Money } from "./flight";

// Provider-neutral booking seller information. Booking actions stay private until
// Slow Layover's affiliate-link strategy has been decided.
export interface BookingOption {
  sellerName: string;
  price: Money;
  flightNumbers: string[];
  fareType?: string;
  optionTitle?: string;
  baggagePrices?: string[];
  isSplitBooking?: boolean;
}
