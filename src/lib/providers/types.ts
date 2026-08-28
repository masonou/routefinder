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

export interface DirectDestinationsInput {
  origin: string;
  departureDate: string;
}

// This deliberately contains only the fields candidate generation needs. Raw
// Explore responses remain inside the SearchAPI provider.
export interface DirectDestination {
  airportCode: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  outboundDate: string;
  indicativePrice?: number;
  currency?: string;
  flightDurationMinutes?: number;
  airlineCode?: string;
  airlineName?: string;
}

export interface DirectDestinationsProvider {
  getDirectDestinations(
    input: DirectDestinationsInput,
  ): Promise<DirectDestination[]>;
}

export interface FlightCalendarInput {
  origin: string;
  destination: string;
  departureWindow: DateWindow;
  // Hub validation permits airline connections; direct baseline discovery does not.
  stopPolicy?: "nonstop" | "two_stops_or_fewer";
}

export interface FlightCalendarDay {
  departureDate: string;
  price?: number;
  currency: string;
  hasFlights: boolean;
}

export interface FlightCalendarProvider {
  getFlightCalendar(input: FlightCalendarInput): Promise<FlightCalendarDay[]>;
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
