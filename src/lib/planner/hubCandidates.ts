import { findAirportByCode } from "../../data/airports.ts";
import {
  MAX_HUB_CANDIDATES,
  MAX_HUB_DETOUR_RATIO,
} from "../constants/planner.ts";
import type {
  DirectDestination,
  DirectDestinationsProvider,
} from "../providers/types.ts";
import { distanceKm, type Coordinates } from "../utils/geography.ts";

export interface HubCandidate {
  airportCode: string;
  city: string;
  country: string;
  firstLegDepartureDate: string;
  latitude: number;
  longitude: number;
  source: "explore";
  detourRatio: number;
  originToHubDistanceKm: number;
  hubToDestinationDistanceKm: number;
  indicativeFirstLegPrice?: number;
  currency?: string;
  firstLegDurationMinutes?: number;
  candidateScore: number;
}

export interface GenerateHubCandidatesInput {
  origin: string;
  destination: string;
  departureDate: string;
}

function normaliseAirportCode(code: string): string {
  return code.trim().toUpperCase();
}

function resolveAirportCoordinates(code: string): Coordinates {
  const airport = findAirportByCode(code);
  if (!airport) {
    throw new Error(`Airport ${code} is not configured.`);
  }

  return { latitude: airport.latitude, longitude: airport.longitude };
}

function calculateCandidateScore(
  detourRatio: number,
  durationMinutes: number | undefined,
  price: number | undefined,
): number {
  // Geography is the primary ranking signal: each 1% detour improvement is
  // worth 10 points. Known first-leg duration and price can contribute at most
  // 10 points each, so neither can outweigh a material geographic improvement.
  const detourScore = (MAX_HUB_DETOUR_RATIO - detourRatio) * 1_000;
  const durationScore =
    durationMinutes === undefined
      ? 0
      : Math.max(0, 1 - Math.min(durationMinutes, 1_440) / 1_440) * 10;
  const priceScore =
    price === undefined
      ? 0
      : Math.max(0, 1 - Math.min(price, 1_000) / 1_000) * 10;

  return Number((detourScore + durationScore + priceScore).toFixed(3));
}

function toHubCandidate(
  directDestination: DirectDestination,
  originCoordinates: Coordinates,
  destinationCoordinates: Coordinates,
  directDistanceKm: number,
): HubCandidate | null {
  const coordinates = {
    latitude: directDestination.latitude,
    longitude: directDestination.longitude,
  };
  const originToHubDistanceKm = distanceKm(originCoordinates, coordinates);
  const hubToDestinationDistanceKm = distanceKm(coordinates, destinationCoordinates);
  const viaHubDistanceKm = originToHubDistanceKm + hubToDestinationDistanceKm;
  const detourRatio = viaHubDistanceKm / directDistanceKm;

  if (!Number.isFinite(detourRatio) || detourRatio > MAX_HUB_DETOUR_RATIO) {
    return null;
  }

  return {
    airportCode: directDestination.airportCode,
    city: directDestination.city,
    country: directDestination.country,
    firstLegDepartureDate: directDestination.outboundDate,
    ...coordinates,
    source: "explore",
    detourRatio: Number(detourRatio.toFixed(4)),
    originToHubDistanceKm: Math.round(originToHubDistanceKm),
    hubToDestinationDistanceKm: Math.round(hubToDestinationDistanceKm),
    ...(directDestination.indicativePrice === undefined
      ? {}
      : { indicativeFirstLegPrice: directDestination.indicativePrice }),
    ...(directDestination.currency ? { currency: directDestination.currency } : {}),
    ...(directDestination.flightDurationMinutes === undefined
      ? {}
      : { firstLegDurationMinutes: directDestination.flightDurationMinutes }),
    candidateScore: calculateCandidateScore(
      detourRatio,
      directDestination.flightDurationMinutes,
      directDestination.indicativePrice,
    ),
  };
}

export async function generateHubCandidates(
  input: GenerateHubCandidatesInput,
  provider: DirectDestinationsProvider,
): Promise<HubCandidate[]> {
  const origin = normaliseAirportCode(input.origin);
  const destination = normaliseAirportCode(input.destination);
  if (!origin || !destination) {
    throw new Error("Origin and destination are required.");
  }
  if (origin === destination) {
    throw new Error("Origin and destination must be different.");
  }

  const originCoordinates = resolveAirportCoordinates(origin);
  const destinationCoordinates = resolveAirportCoordinates(destination);
  const directDistanceKm = distanceKm(originCoordinates, destinationCoordinates);
  if (directDistanceKm < 0.001) {
    throw new Error("Origin and destination coordinates must be different.");
  }

  const directDestinations = await provider.getDirectDestinations({
    origin,
    departureDate: input.departureDate,
  });
  const candidates = directDestinations
    .filter(
      (directDestination) =>
        directDestination.airportCode !== origin &&
        directDestination.airportCode !== destination,
    )
    .map((directDestination) =>
      toHubCandidate(
        directDestination,
        originCoordinates,
        destinationCoordinates,
        directDistanceKm,
      ),
    )
    .filter((candidate): candidate is HubCandidate => candidate !== null)
    .sort(
      (left, right) =>
        right.candidateScore - left.candidateScore ||
        left.detourRatio - right.detourRatio ||
        left.airportCode.localeCompare(right.airportCode),
    );

  return candidates.slice(0, MAX_HUB_CANDIDATES);
}
