import assert from "node:assert/strict";
import test from "node:test";

import { distanceKm } from "./geography.ts";

test("great-circle distance is zero for the same coordinate", () => {
  assert.equal(
    distanceKm(
      { latitude: -27.3842, longitude: 153.117 },
      { latitude: -27.3842, longitude: 153.117 },
    ),
    0,
  );
});

test("great-circle distance is approximately correct for a normal city pair", () => {
  const londonToParisKm = distanceKm(
    { latitude: 51.5074, longitude: -0.1278 },
    { latitude: 48.8566, longitude: 2.3522 },
  );
  assert.ok(londonToParisKm > 340 && londonToParisKm < 350);
});

test("great-circle distance works across hemispheres", () => {
  const brisbaneToLarnacaKm = distanceKm(
    { latitude: -27.3842, longitude: 153.117 },
    { latitude: 34.8751, longitude: 33.6249 },
  );
  assert.ok(brisbaneToLarnacaKm > 14_000 && brisbaneToLarnacaKm < 14_500);
});
