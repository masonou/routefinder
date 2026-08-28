import { AIRPORTS } from "./airports.generated.ts";

export { AIRPORTS, type Airport } from "./airports.generated.ts";

const airportsByCode = new Map(AIRPORTS.map((airport) => [airport.iataCode, airport]));

export function findAirportByCode(code: string) {
  return airportsByCode.get(code.trim().toUpperCase());
}

export function getAirportCityName(code: string): string {
  const normalisedCode = code.trim().toUpperCase();
  return findAirportByCode(normalisedCode)?.city ?? normalisedCode;
}
