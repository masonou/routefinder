import type { FlightOffer, Money } from "./flight";

/** A deliberate multi-day stop between separately booked flight offers. */
export interface ItineraryStopover {
  airportCode: string;
  // Descriptive metadata for rendering; airportCode remains the operational identity.
  city?: string;
  country?: string;
  nights: number;
}

/**
 * A separately booked flight in an itinerary. Airline connections remain inside
 * the flight's segments; stopoverAfter only represents an intentional stay.
 */
export interface ItineraryLeg {
  flight: FlightOffer;
  stopoverAfter?: ItineraryStopover;
}

export interface Itinerary {
  id: string;
  origin: string;
  destination: string;
  legs: ItineraryLeg[];
  totalPrice: Money;
  totalFlightDurationMinutes: number;
  // Airline connections inside FlightOffer objects; intentional stays are excluded.
  totalStops: number;
  score: number;
}

export interface CreateItineraryInput {
  origin: string;
  destination: string;
  legs: ItineraryLeg[];
  score: number;
}

export function calculateItineraryTotalPrice(legs: readonly ItineraryLeg[]): Money {
  const [firstLeg] = legs;
  if (!firstLeg) {
    throw new Error("An itinerary must contain at least one leg.");
  }

  const currency = firstLeg.flight.indicativePrice.currency;
  let amount = 0;
  for (const { flight } of legs) {
    if (flight.indicativePrice.currency !== currency) {
      throw new Error("Itinerary leg currencies must match before prices are totalled.");
    }
    amount += flight.indicativePrice.amount;
  }
  return { amount, currency };
}

export function calculateItineraryFlightDuration(legs: readonly ItineraryLeg[]): number {
  return legs.reduce((total, { flight }) => total + flight.durationMinutes, 0);
}

export function calculateItineraryStops(legs: readonly ItineraryLeg[]): number {
  return legs.reduce((total, { flight }) => total + flight.stops, 0);
}

export function getItineraryStopovers(itinerary: Pick<Itinerary, "legs">): ItineraryStopover[] {
  return itinerary.legs.flatMap((leg) =>
    leg.stopoverAfter ? [leg.stopoverAfter] : [],
  );
}

export function buildItineraryId(
  origin: string,
  destination: string,
  legs: readonly ItineraryLeg[],
): string {
  return [
    origin,
    destination,
    ...legs.map(({ flight, stopoverAfter }) =>
      [
        flight.id,
        flight.departureAt,
        flight.arrivalAt,
        stopoverAfter?.airportCode ?? "",
        stopoverAfter?.nights ?? "",
      ].join("~"),
    ),
  ].join("__");
}

function assertValidItineraryLegs(
  origin: string,
  destination: string,
  legs: readonly ItineraryLeg[],
): void {
  const [firstLeg] = legs;
  const lastLeg = legs.at(-1);
  if (!firstLeg || !lastLeg) {
    throw new Error("An itinerary must contain at least one leg.");
  }
  if (firstLeg.flight.origin !== origin) {
    throw new Error("The first itinerary leg must start at the itinerary origin.");
  }
  if (lastLeg.flight.destination !== destination) {
    throw new Error("The final itinerary leg must end at the itinerary destination.");
  }
  if (lastLeg.stopoverAfter) {
    throw new Error("The final itinerary leg cannot have a stopover.");
  }

  for (let index = 0; index < legs.length; index += 1) {
    const leg = legs[index] as ItineraryLeg;
    const nextLeg = legs[index + 1];
    if (leg.stopoverAfter) {
      if (leg.stopoverAfter.airportCode !== leg.flight.destination) {
        throw new Error("A stopover must belong to its leg's arrival airport.");
      }
      if (!Number.isInteger(leg.stopoverAfter.nights) || leg.stopoverAfter.nights <= 0) {
        throw new Error("An intentional stopover must have a positive whole number of nights.");
      }
    }
    if (nextLeg && leg.flight.destination !== nextLeg.flight.origin) {
      throw new Error("Adjacent itinerary legs must connect at the same airport.");
    }
  }
}

export function createItinerary({
  origin,
  destination,
  legs,
  score,
}: CreateItineraryInput): Itinerary {
  assertValidItineraryLegs(origin, destination, legs);
  return {
    id: buildItineraryId(origin, destination, legs),
    origin,
    destination,
    legs,
    totalPrice: calculateItineraryTotalPrice(legs),
    totalFlightDurationMinutes: calculateItineraryFlightDuration(legs),
    totalStops: calculateItineraryStops(legs),
    score,
  };
}
