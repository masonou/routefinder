import { AIRPORTS, type Airport } from "../../data/airports.ts";

const MAX_AIRPORT_SUGGESTIONS = 8;
const TYPE_PRIORITY: Record<Airport["type"], number> = {
  large_airport: 0,
  medium_airport: 1,
  small_airport: 2,
};

function normaliseSearchText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const SEARCHABLE_AIRPORTS = AIRPORTS.map((airport) => ({
  airport,
  code: normaliseSearchText(airport.iataCode),
  city: normaliseSearchText(airport.city),
  name: normaliseSearchText(airport.name),
  country: normaliseSearchText(airport.country),
}));

function matchRank(
  searchableAirport: (typeof SEARCHABLE_AIRPORTS)[number],
  query: string,
): number | null {
  const { code, city, name, country } = searchableAirport;

  if (code === query) return 0;
  if (code.startsWith(query)) return 1;
  if (city === query) return 2;
  if (city.startsWith(query)) return 3;
  if (name.startsWith(query)) return 4;
  if (code.includes(query) || city.includes(query) || name.includes(query)) return 5;
  if (country.includes(query)) return 6;
  return null;
}

export function searchAirports(query: string, limit = MAX_AIRPORT_SUGGESTIONS): Airport[] {
  const normalisedQuery = normaliseSearchText(query.trim());
  if (!normalisedQuery) return [];

  return SEARCHABLE_AIRPORTS
    .map(({ airport, ...searchableAirport }) => ({
      airport,
      rank: matchRank({ airport, ...searchableAirport }, normalisedQuery),
    }))
    .filter((entry): entry is { airport: Airport; rank: number } => entry.rank !== null)
    .sort((left, right) =>
      left.rank - right.rank ||
      TYPE_PRIORITY[left.airport.type] - TYPE_PRIORITY[right.airport.type] ||
      left.airport.city.localeCompare(right.airport.city) ||
      left.airport.iataCode.localeCompare(right.airport.iataCode)
    )
    .slice(0, limit)
    .map((entry) => entry.airport);
}

export { MAX_AIRPORT_SUGGESTIONS };
