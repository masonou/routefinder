import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const AIRPORTS_SOURCE_URL = "https://ourairports.com/data/airports.csv";
const COUNTRIES_SOURCE_URL = "https://ourairports.com/data/countries.csv";
const OUTPUT_PATH = resolve(process.cwd(), "src/data/airports.generated.ts");

export const PASSENGER_AIRPORT_TYPES = new Set([
  "large_airport",
  "medium_airport",
  "small_airport",
]);

const TYPE_PRIORITY: Record<string, number> = {
  large_airport: 0,
  medium_airport: 1,
  small_airport: 2,
};

export interface CsvRow {
  ident?: string;
  type?: string;
  name?: string;
  latitude_deg?: string;
  longitude_deg?: string;
  iso_country?: string;
  municipality?: string;
  scheduled_service?: string;
  iata_code?: string;
}

export interface GeneratedAirport {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  type: "large_airport" | "medium_airport" | "small_airport";
}

function value(row: CsvRow, key: keyof CsvRow): string {
  return row[key]?.trim() ?? "";
}

function parseCoordinate(raw: string, min: number, max: number): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function normaliseAirportRow(
  row: CsvRow,
  countryNames: ReadonlyMap<string, string>,
): GeneratedAirport | null {
  const type = value(row, "type");
  const iataCode = value(row, "iata_code").toUpperCase();
  if (
    !PASSENGER_AIRPORT_TYPES.has(type) ||
    value(row, "scheduled_service").toLowerCase() !== "yes" ||
    !/^[A-Z]{3}$/.test(iataCode)
  ) {
    return null;
  }

  const latitude = parseCoordinate(value(row, "latitude_deg"), -90, 90);
  const longitude = parseCoordinate(value(row, "longitude_deg"), -180, 180);
  if (latitude === null || longitude === null) return null;

  const name = value(row, "name") || iataCode;
  const countryCode = value(row, "iso_country").toUpperCase();
  return {
    iataCode,
    name,
    city: value(row, "municipality") || name,
    country: countryNames.get(countryCode) || countryCode || "Unknown",
    latitude,
    longitude,
    type: type as GeneratedAirport["type"],
  };
}

/**
 * Resolves duplicate codes deterministically: airport type (large, medium,
 * small), then records with a named municipality, country name, and non-code
 * airport name, followed by lexical name, municipality, and country order.
 */
function compareAirportRecords(left: GeneratedAirport, right: GeneratedAirport): number {
  return (
    TYPE_PRIORITY[left.type] - TYPE_PRIORITY[right.type] ||
    Number(Boolean(right.city && right.city !== right.name)) -
      Number(Boolean(left.city && left.city !== left.name)) ||
    Number(right.country !== "Unknown") - Number(left.country !== "Unknown") ||
    Number(right.name !== right.iataCode) - Number(left.name !== left.iataCode) ||
    left.name.localeCompare(right.name) ||
    left.city.localeCompare(right.city) ||
    left.country.localeCompare(right.country)
  );
}

export function generateAirportCatalogue(
  rows: Iterable<CsvRow>,
  countryNames: ReadonlyMap<string, string>,
): GeneratedAirport[] {
  const airportsByCode = new Map<string, GeneratedAirport>();
  for (const row of rows) {
    const airport = normaliseAirportRow(row, countryNames);
    if (!airport) continue;
    const current = airportsByCode.get(airport.iataCode);
    if (!current || compareAirportRecords(airport, current) < 0) {
      airportsByCode.set(airport.iataCode, airport);
    }
  }
  return [...airportsByCode.values()].sort((left, right) =>
    left.iataCode.localeCompare(right.iataCode),
  );
}

/** Small RFC 4180-compatible parser for the public OurAirports CSV files. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const [headers = [], ...records] = rows;
  return records
    .filter((record) => record.length === headers.length)
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index]])));
}

export function countryNamesFromCsv(text: string): Map<string, string> {
  return new Map(
    parseCsv(text)
      .filter((row) => row.code?.trim() && row.name?.trim())
      .map((row) => [row.code.trim().toUpperCase(), row.name.trim()]),
  );
}

export function renderGeneratedAirports(airports: GeneratedAirport[]): string {
  return `// Generated by scripts/generateAirports.ts from OurAirports. Do not edit manually.\n\nexport interface Airport {\n  iataCode: string;\n  name: string;\n  city: string;\n  country: string;\n  latitude: number;\n  longitude: number;\n  type: \"large_airport\" | \"medium_airport\" | \"small_airport\";\n}\n\nexport const AIRPORTS: readonly Airport[] = ${JSON.stringify(airports)} as const;\n`;
}

async function download(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": "Slow-Layover-airport-generator" } });
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  return response.text();
}

export async function main(): Promise<void> {
  const [airportCsv, countryCsv] = await Promise.all([
    download(AIRPORTS_SOURCE_URL),
    download(COUNTRIES_SOURCE_URL),
  ]);
  const airports = generateAirportCatalogue(parseCsv(airportCsv), countryNamesFromCsv(countryCsv));
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, renderGeneratedAirports(airports), "utf8");
  console.log(`Generated ${airports.length} passenger airports at ${OUTPUT_PATH}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await main();
}
