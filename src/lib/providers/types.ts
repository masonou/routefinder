import type { FlightOffer } from "../../types/flight.ts";
import type { BookingOption } from "../../types/booking.ts";
import type { DateWindow } from "../../types/trip.ts";

export interface FlightSearchInput {
  origin: string;
  destination: string;
  departureWindow: DateWindow;
  adults: number;
}

export interface FlightProvider {
  name: string;
  searchOneWay(input: FlightSearchInput): Promise<FlightOffer[]>;
}

export interface BookingOptionsInput {
  bookingReference: string;
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
}

export interface BookingOptionsProvider {
  getBookingOptions(input: BookingOptionsInput): Promise<BookingOption[]>;
}
