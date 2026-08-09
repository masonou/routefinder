import assert from "node:assert/strict";
import test from "node:test";

import { findAirportByCode } from "../../data/airports.ts";
import { searchAirports } from "./airportSearch.ts";
import { DEPARTURE_FLEX_DAYS } from "../constants/planner.ts";
import {
  SearchValidationError,
  buildResultsUrl,
  createSearchRequestFromFormValues,
  toTripRequest,
  validateSearchApiBody,
  validateSearchFormValues,
} from "./searchValidation.ts";

const validValues = {
  origin: "BNE",
  destination: "LCA",
  earliestDeparture: "2099-08-10",
};

test("an exact IATA search ranks first", () => {
  assert.equal(searchAirports("lca")[0]?.iataCode, "LCA");
});

test("airport search supports city, airport name, country, and case-insensitive matching", () => {
  assert.equal(searchAirports("brisbane")[0]?.iataCode, "BNE");
  assert.equal(searchAirports("heathrow")[0]?.iataCode, "LHR");
  assert.ok(searchAirports("cyPrUs").some((airport) => airport.iataCode === "LCA"));
});

test("airport suggestions are limited to eight", () => {
  assert.ok(searchAirports("a").length <= 8);
});

test("airport lookup returns undefined for an unknown code", () => {
  assert.equal(findAirportByCode("ZZZ"), undefined);
});

test("selected airport codes and dates form the public search request", () => {
  assert.deepEqual(createSearchRequestFromFormValues(validValues), {
    ...validValues,
    adults: 1,
  });
});

test("invalid free-form airport text cannot be submitted", () => {
  assert.equal(validateSearchFormValues({ ...validValues, origin: "Brisbane" }).origin, "Select an airport.");
  assert.throws(
    () => createSearchRequestFromFormValues({ ...validValues, origin: "Brisbane" }),
    SearchValidationError
  );
});

test("origin and destination cannot be identical", () => {
  assert.equal(validateSearchFormValues({ ...validValues, destination: "BNE" }).destination, "Choose different airports.");
});

test("a past earliest departure is rejected", () => {
  assert.equal(
    validateSearchFormValues({ ...validValues, earliestDeparture: "2000-01-01" }).dates,
    "Dates cannot be in the past."
  );
});

test("API validation no longer requires latest arrival and derives a four-day window", () => {
  const publicRequest = validateSearchApiBody(validValues);
  assert.deepEqual(toTripRequest(publicRequest), {
    origin: "BNE",
    destination: "LCA",
    departureWindow: { start: "2099-08-10", end: "2099-08-13" },
    adults: 1,
  });
  assert.equal(DEPARTURE_FLEX_DAYS, 3);
});

test("buildResultsUrl uses only the simplified search parameters", () => {
  assert.equal(
    buildResultsUrl(validValues),
    "/results?origin=BNE&destination=LCA&earliestDeparture=2099-08-10"
  );
});
