import assert from "node:assert/strict";
import test from "node:test";

import { getAirportCityName } from "./airports.ts";

test("airport city names use the shared airport catalogue and fall back to IATA", () => {
  assert.equal(getAirportCityName("SAW"), "Istanbul");
  assert.equal(getAirportCityName("IST"), "Istanbul");
  assert.equal(getAirportCityName("SIN"), "Singapore");
  assert.equal(getAirportCityName("DXB"), "Dubai");
  assert.equal(getAirportCityName("XYZ"), "XYZ");
});
