import assert from "node:assert/strict";
import test from "node:test";

import { getFlexibleDepartureDates } from "./flexibleDepartureDates.ts";

test("the flexible departure picker includes the selected date and next three calendar days", () => {
  assert.deepEqual(getFlexibleDepartureDates("2026-09-20"), [
    "2026-09-20",
    "2026-09-21",
    "2026-09-22",
    "2026-09-23",
  ]);
});

test("the flexible departure range crosses month and year boundaries safely", () => {
  assert.deepEqual(getFlexibleDepartureDates("2026-09-29"), [
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
  ]);
  assert.deepEqual(getFlexibleDepartureDates("2026-12-30"), [
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
  ]);
});
