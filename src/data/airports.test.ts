import assert from "node:assert/strict";
import test from "node:test";

import { findAirportByCode, getAirportCityName } from "./airports.ts";

test("airport city names use the generated global catalogue and fall back to IATA", () => {
  assert.equal(getAirportCityName("BOM"), "Mumbai");
  assert.equal(getAirportCityName("KUL"), findAirportByCode("KUL")?.city);
  assert.equal(getAirportCityName("SHJ"), "Sharjah");
  assert.equal(getAirportCityName("SAW"), findAirportByCode("SAW")?.city);
  assert.equal(getAirportCityName("SIN"), "Singapore");
  assert.equal(getAirportCityName("DXB"), "Dubai");
  assert.equal(getAirportCityName("XYZ"), "XYZ");
});
