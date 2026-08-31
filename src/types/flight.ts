export interface Money {
  amount: number;
  currency: string;
}

export interface FlightSegment {
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  airlineName: string;
  airlineCode?: string;
  flightNumber?: string;
}

// Provider-neutral internal flight format used throughout the planner.
export interface FlightOffer {
  id: string;
  provider: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  stops: number;
  segments: FlightSegment[];
  // Price returned during discovery and ranking, which may differ from the final affiliate booking price.
  indicativePrice: Money;
}
