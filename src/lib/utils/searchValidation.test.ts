import assert from "node:assert/strict";
import test from "node:test";

import { findAirportByCode } from "../../data/airports.ts";
import { searchAirports } from "./airportSearch.ts";
import { MIN_HUB_STAY_NIGHTS } from "../constants/planner.ts";
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
  latestArrival: "2099-08-18",
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

test("the shortest window that allows the minimum hub stay is accepted", () => {
  const latestArrival = "2099-08-12";
  assert.equal(
    validateSearchFormValues({ ...validValues, latestArrival }).dates,
    undefined
  );
  assert.equal(MIN_HUB_STAY_NIGHTS, 2);
});

test("a window too short for the hub stay is rejected", () => {
  assert.equal(
    validateSearchFormValues({ ...validValues, latestArrival: "2099-08-11" }).dates,
    "Allow at least 2 nights."
  );
});

test("a fourteen-day inclusive window is accepted and fifteen days is rejected", () => {
  assert.equal(validateSearchFormValues({ ...validValues, latestArrival: "2099-08-23" }).dates, undefined);
  assert.equal(
    validateSearchFormValues({ ...validValues, latestArrival: "2099-08-24" }).dates,
    "Maximum trip window is 14 days."
  );
});

test("API validation defaults adults and derives the planner windows", () => {
  const publicRequest = validateSearchApiBody(validValues);
  assert.deepEqual(toTripRequest(publicRequest), {
    origin: "BNE",
    destination: "LCA",
    departureWindow: { start: "2099-08-10", end: "2099-08-16" },
    arrivalWindow: { start: "2099-08-10", end: "2099-08-18" },
    adults: 1,
  });
});

test("buildResultsUrl uses only the simplified search parameters", () => {
  assert.equal(
    buildResultsUrl(validValues),
    "/results?origin=BNE&destination=LCA&earliestDeparture=2099-08-10&latestArrival=2099-08-18"
  );
});
