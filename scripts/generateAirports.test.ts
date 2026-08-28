import assert from "node:assert/strict";
import test from "node:test";

import { generateAirportCatalogue } from "./generateAirports.ts";

const countries = new Map([["AU", "Australia"]]);
const row = (overrides: Record<string, string> = {}) => ({
  ident: "test",
  type: "medium_airport",
  name: "Test Airport",
  latitude_deg: "-27.4",
  longitude_deg: "153.1",
  iso_country: "AU",
  municipality: "Test City",
  scheduled_service: "yes",
  iata_code: "TST",
  ...overrides,
});

test("generation keeps scheduled passenger airports and filters invalid records", () => {
  const airports = generateAirportCatalogue([
    row(),
    row({ iata_code: "" }),
    row({ type: "heliport", iata_code: "HEL" }),
    row({ type: "closed", iata_code: "CLS" }),
    row({ latitude_deg: "not-a-number", iata_code: "BAD" }),
  ], countries);
  assert.deepEqual(airports.map((airport) => airport.iataCode), ["TST"]);
});

test("generation chooses the deterministic highest-priority duplicate", () => {
  const airports = generateAirportCatalogue([
    row({ type: "small_airport", name: "Small duplicate", municipality: "" }),
    row({ type: "medium_airport", name: "Medium duplicate", municipality: "Better City" }),
    row({ type: "large_airport", name: "Large duplicate", municipality: "Large City" }),
  ], countries);
  assert.equal(airports[0]?.name, "Large duplicate");
  assert.equal(airports[0]?.city, "Large City");
});
