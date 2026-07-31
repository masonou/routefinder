import type { FlightOffer } from "../../types/flight.ts";
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
