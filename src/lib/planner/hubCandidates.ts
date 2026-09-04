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
  /** Destination-origin Explore saw this airport; a proxy signal only. */
  reverseNetworkMatch?: boolean;
  candidateScore: number;
}

export interface GenerateHubCandidatesInput {
  origin: string;
  destination: string;
  departureDate: string;
  reverseDestinationNetwork?: ReadonlySet<string>;
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
  reverseDestinationNetwork: ReadonlySet<string>,
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
    reverseNetworkMatch: reverseDestinationNetwork.has(
      normaliseAirportCode(directDestination.airportCode),
    ),
    candidateScore: calculateHubCandidateScoreBreakdown(
      detourRatio,
      directDestination.flightDurationMinutes,
      directDestination.indicativePrice,
    ).total,
  };
}

function compareHubCandidates(left: HubCandidate, right: HubCandidate): number {
  return (
    Number(Boolean(right.reverseNetworkMatch)) - Number(Boolean(left.reverseNetworkMatch)) ||
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

// Calendar validation is intentionally bounded: no single hub can contribute
// more than two eligible variants. This does not yet consume the global budget.
export function getCalendarCandidateVariantPool(
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

  return [...selectedByHub.values()].flat().sort(compareHubCandidates);
}

// Spend the fixed Calendar budget on a first opportunity for each strong hub
// before consuming it on another departure-date variant of a hub already seen.
export function selectCalendarCandidateVariants(
  candidates: HubCandidate[],
  maxCalendarCandidates = MAX_CALENDAR_CANDIDATES,
): HubCandidate[] {
  const eligibleVariants = getCalendarCandidateVariantPool(candidates);
  const selected: HubCandidate[] = [];
  const selectedKeys = new Set<string>();
  const selectedHubs = new Set<string>();

  // The eligible pool is already in the established deterministic Stage 1
  // order, so the first variant encountered remains each hub's strongest one.
  for (const candidate of eligibleVariants) {
    const hub = candidate.airportCode.trim().toUpperCase();
    if (selectedHubs.has(hub)) continue;
    selected.push(candidate);
    selectedKeys.add(candidateVariantKey(candidate));
    selectedHubs.add(hub);
    if (selected.length === maxCalendarCandidates) return selected;
  }

  // When there are fewer unique hubs than slots, retain the existing global
  // order for the best unused date variants.
  for (const candidate of eligibleVariants) {
    if (selectedKeys.has(candidateVariantKey(candidate))) continue;
    selected.push(candidate);
    if (selected.length === maxCalendarCandidates) break;
  }
  return selected;
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
  const reverseDestinationNetwork = input.reverseDestinationNetwork ?? new Set<string>();
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
        reverseDestinationNetwork,
      ),
    )
    .filter((candidate): candidate is HubCandidate => candidate !== null)
    .sort(compareHubCandidates);

  return candidates.slice(0, MAX_HUB_CANDIDATES);
}
