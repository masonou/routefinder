import { findAirportByCode } from "../../data/airports.ts";
import {
  MAX_CALENDAR_CANDIDATES,
  MAX_DEPARTURE_VARIANTS_PER_HUB,
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

export interface HubCandidateScoreBreakdown {
  geography: number;
  duration: number;
  price: number;
  total: number;
}

// Exported for the diagnostic command. Candidate generation continues to use this
// exact calculation, so diagnostics cannot drift from Stage 1 ranking.
export function calculateHubCandidateScoreBreakdown(
  detourRatio: number,
  durationMinutes: number | undefined,
  price: number | undefined,
): HubCandidateScoreBreakdown {
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

  return {
    geography: Number(detourScore.toFixed(3)),
    duration: Number(durationScore.toFixed(3)),
    price: Number(priceScore.toFixed(3)),
    total: Number((detourScore + durationScore + priceScore).toFixed(3)),
  };
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
    candidateScore: calculateHubCandidateScoreBreakdown(
      detourRatio,
      directDestination.flightDurationMinutes,
      directDestination.indicativePrice,
    ).total,
  };
}

function compareHubCandidates(left: HubCandidate, right: HubCandidate): number {
  return (
    right.candidateScore - left.candidateScore ||
    left.detourRatio - right.detourRatio ||
    (left.indicativeFirstLegPrice ?? Infinity) -
      (right.indicativeFirstLegPrice ?? Infinity) ||
    (left.firstLegDurationMinutes ?? Infinity) -
      (right.firstLegDurationMinutes ?? Infinity) ||
    left.firstLegDepartureDate.localeCompare(right.firstLegDepartureDate) ||
    left.airportCode.localeCompare(right.airportCode)
  );
}

function candidateVariantKey(candidate: HubCandidate): string {
  return `${candidate.airportCode.trim().toUpperCase()}:${candidate.firstLegDepartureDate}`;
}

// Explore results can repeat an airport/date pair. Retain the candidate with the
// strongest existing geography-first quality score, while preserving distinct
// dates as meaningful first-leg alternatives.
export function deduplicateHubCandidateVariants(
  candidates: HubCandidate[],
): HubCandidate[] {
  const variants = new Map<string, HubCandidate>();

  for (const candidate of candidates) {
    const key = candidateVariantKey(candidate);
    const existing = variants.get(key);
    if (!existing || compareHubCandidates(candidate, existing) < 0) {
      variants.set(key, candidate);
    }
  }

  return [...variants.values()].sort(compareHubCandidates);
}

// Calendar validation is intentionally bounded: no single hub can consume more
// than two of the eight available variant slots.
export function selectCalendarCandidateVariants(
  candidates: HubCandidate[],
): HubCandidate[] {
  const selectedByHub = new Map<string, HubCandidate[]>();

  for (const candidate of deduplicateHubCandidateVariants(candidates)) {
    const hub = candidate.airportCode.trim().toUpperCase();
    const variants = selectedByHub.get(hub) ?? [];
    if (variants.length < MAX_DEPARTURE_VARIANTS_PER_HUB) {
      variants.push(candidate);
      selectedByHub.set(hub, variants);
    }
  }

  return [...selectedByHub.values()]
    .flat()
    .sort(compareHubCandidates)
    .slice(0, MAX_CALENDAR_CANDIDATES);
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
    .sort(compareHubCandidates);

  return candidates.slice(0, MAX_HUB_CANDIDATES);
}
