import assert from "node:assert/strict";
import test from "node:test";

import {
  SearchValidationError,
  buildResultsUrl,
  createSearchRequestFromFormValues,
  normalizeAirportCodeInput,
  validateSearchApiBody,
  validateSearchFormValues,
} from "./searchValidation.ts";

test("search form airport normalisation uppercases and trims to three letters", () => {
  assert.equal(normalizeAirportCodeInput("bne1"), "BNE");
  assert.equal(normalizeAirportCodeInput(" lcax "), "LCA");
});

test("departure range longer than seven days is rejected", () => {
  const errors = validateSearchFormValues({
    origin: "BNE",
    destination: "LCA",
    departureStart: "2026-09-01",
    departureEnd: "2026-09-08",
    arrivalStart: "2026-09-10",
    arrivalEnd: "2026-09-20",
  });

  assert.equal(errors.departure, "Range must be 7 days or less.");
});

test("invalid date order is rejected", () => {
  const errors = validateSearchFormValues({
    origin: "BNE",
    destination: "LCA",
    departureStart: "2026-09-12",
    departureEnd: "2026-09-06",
    arrivalStart: "2026-09-12",
    arrivalEnd: "2026-09-20",
  });

  assert.equal(errors.departure, "Latest date must be after earliest.");
});

test("API request validation normalises airports and defaults adults", () => {
  const request = validateSearchApiBody({
    origin: "bne",
    destination: "lca",
    departureWindow: {
      start: "2026-09-06",
      end: "2026-09-12",
    },
    arrivalWindow: {
      start: "2026-09-12",
      end: "2026-09-20",
    },
  });

  assert.deepEqual(request, {
    origin: "BNE",
    destination: "LCA",
    departureWindow: {
      start: "2026-09-06",
      end: "2026-09-12",
    },
    arrivalWindow: {
      start: "2026-09-12",
      end: "2026-09-20",
    },
    adults: 1,
  });
});

test("API request validation rejects invalid airport codes", () => {
  assert.throws(
    () =>
      validateSearchApiBody({
        origin: "BN",
        destination: "LCA",
        departureWindow: {
          start: "2026-09-06",
          end: "2026-09-12",
        },
        arrivalWindow: {
          start: "2026-09-12",
          end: "2026-09-20",
        },
        adults: 1,
      }),
    SearchValidationError
  );
});

test("buildResultsUrl produces the expected query string", () => {
  assert.equal(
    buildResultsUrl({
      origin: "bne",
      destination: "lca",
      departureStart: "2026-09-06",
      departureEnd: "2026-09-12",
      arrivalStart: "2026-09-12",
      arrivalEnd: "2026-09-20",
    }),
    "/results?origin=BNE&destination=LCA&departureStart=2026-09-06&departureEnd=2026-09-12&arrivalStart=2026-09-12&arrivalEnd=2026-09-20"
  );
});

test("createSearchRequestFromFormValues keeps one adult internally", () => {
  const request = createSearchRequestFromFormValues({
    origin: "BNE",
    destination: "LCA",
    departureStart: "2026-09-06",
    departureEnd: "2026-09-12",
    arrivalStart: "2026-09-12",
    arrivalEnd: "2026-09-20",
  });

  assert.equal(request.adults, 1);
});
