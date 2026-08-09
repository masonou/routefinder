import { MAX_RESULTS } from "../constants/planner.ts";
import { selectDiverseItineraries } from "./deduplicateItineraries.ts";
import {
  calculateHubStayNights,
  deriveSecondLegDepartureWindow,
  isCompatibleConnection,
  isFlightWithinDepartureWindow,
  isReasonableFlight,
  isValidDateWindow,
} from "./filters.ts";
import { getCandidateHubs } from "./hubs.ts";
import { scoreRoute } from "./scoreRoute.ts";
import type { FlightProvider } from "../providers/types.ts";
import type { Itinerary } from "../../types/itinerary.ts";
import type { TripRequest } from "../../types/trip.ts";

function normaliseAirportCode(code: string): string {
  return code.trim().toUpperCase();
}

function validateAdults(adults: number | undefined): number {
  const value = adults ?? 1;

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Adults must be a positive integer.");
  }

  return value;
}

function compareIsoDates(left: string, right: string): number {
  return left.localeCompare(right);
}

function matchesRoute(flightOrigin: string, flightDestination: string, origin: string, destination: string): boolean {
  return flightOrigin === origin && flightDestination === destination;
}

export async function planTrip(
  request: TripRequest,
  provider: FlightProvider
): Promise<Itinerary[]> {
  const origin = normaliseAirportCode(request.origin);
  const destination = normaliseAirportCode(request.destination);
  const adults = validateAdults(request.adults);

  if (!origin || !destination) {
    throw new Error("Origin and destination are required.");
  }

  if (origin === destination) {
    throw new Error("Origin and destination must be different.");
  }

  if (!isValidDateWindow(request.departureWindow)) {
    throw new Error("Departure window must be a valid inclusive ISO date range.");
  }

  if (request.arrivalWindow && !isValidDateWindow(request.arrivalWindow)) {
    throw new Error("Arrival window must be a valid inclusive ISO date range.");
  }

  if (
    request.arrivalWindow &&
    compareIsoDates(request.departureWindow.start, request.arrivalWindow.end) > 0
  ) {
    throw new Error("Departure window cannot begin after the arrival window ends.");
  }

  const itineraries: Itinerary[] = [];
  const candidateHubs = getCandidateHubs();

  for (const hubCode of candidateHubs) {
    const hub = normaliseAirportCode(hubCode);
    if (hub === origin || hub === destination) {
      continue;
    }

    const firstLegOffers = (
      await provider.searchOneWay({
        origin,
        destination: hub,
        departureWindow: request.departureWindow,
        adults,
      })
    ).filter((offer) => {
      return (
        matchesRoute(offer.origin, offer.destination, origin, hub) &&
        isFlightWithinDepartureWindow(offer, request.departureWindow) &&
        isReasonableFlight(offer)
      );
    });

    const secondLegDepartureWindow = deriveSecondLegDepartureWindow(
      firstLegOffers,
      request.arrivalWindow
    );
    if (!secondLegDepartureWindow) {
      continue;
    }

    const secondLegOffers = (
      await provider.searchOneWay({
        origin: hub,
        destination,
        departureWindow: secondLegDepartureWindow,
        adults,
      })
    ).filter((offer) => {
      return (
        matchesRoute(offer.origin, offer.destination, hub, destination) &&
        isFlightWithinDepartureWindow(offer, secondLegDepartureWindow) &&
        isReasonableFlight(offer)
      );
    });

    for (const firstLeg of firstLegOffers) {
      for (const secondLeg of secondLegOffers) {
        if (!isCompatibleConnection(firstLeg, secondLeg, hub, request.arrivalWindow)) {
          continue;
        }

        const totalPriceAmount =
          firstLeg.indicativePrice.amount + secondLeg.indicativePrice.amount;
        const itinerary: Itinerary = {
          id: `${firstLeg.id}__${secondLeg.id}`,
          origin,
          hub,
          destination,
          firstLeg,
          secondLeg,
          hubStayNights: calculateHubStayNights(firstLeg, secondLeg),
          totalPrice: {
            amount: totalPriceAmount,
            currency: firstLeg.indicativePrice.currency,
          },
          totalFlightDurationMinutes:
            firstLeg.durationMinutes + secondLeg.durationMinutes,
          totalStops: firstLeg.stops + secondLeg.stops,
          score: 0,
        };

        itinerary.score = scoreRoute(itinerary);
        itineraries.push(itinerary);
      }
    }
  }

  return selectDiverseItineraries(itineraries, MAX_RESULTS);
}
