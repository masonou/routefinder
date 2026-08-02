import { AIRPORTS, type Airport } from "../../data/airports.ts";

const MAX_AIRPORT_SUGGESTIONS = 8;

function matchRank(airport: Airport, query: string): number | null {
  const code = airport.iataCode.toLowerCase();
  const city = airport.city.toLowerCase();
  const name = airport.name.toLowerCase();
  const country = airport.country.toLowerCase();

  if (code === query) return 0;
  if (code.startsWith(query)) return 1;
  if (city.startsWith(query)) return 2;
  if (name.startsWith(query)) return 3;
  if (city.includes(query) || name.includes(query)) return 4;
  if (country.includes(query)) return 5;
  return null;
}

export function searchAirports(query: string, limit = MAX_AIRPORT_SUGGESTIONS): Airport[] {
  const normalisedQuery = query.trim().toLowerCase();
  if (!normalisedQuery) return [];

  return AIRPORTS
    .map((airport) => ({ airport, rank: matchRank(airport, normalisedQuery) }))
    .filter((entry): entry is { airport: Airport; rank: number } => entry.rank !== null)
    .sort((left, right) =>
      left.rank - right.rank ||
      left.airport.city.localeCompare(right.airport.city) ||
      left.airport.iataCode.localeCompare(right.airport.iataCode)
    )
    .slice(0, limit)
    .map((entry) => entry.airport);
}

export { MAX_AIRPORT_SUGGESTIONS };
