import type { FlightOffer, Money } from "./flight";

export interface Itinerary {
  id: string;
  origin: string;
  hub: string;
  destination: string;
  firstLeg: FlightOffer;
  secondLeg: FlightOffer;
  hubStayNights: number;
  totalPrice: Money;
  totalFlightDurationMinutes: number;
  totalStops: number;
  score: number;
}
