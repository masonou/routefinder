import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  enumerateDateWindow,
  MAX_FLEXIBLE_SEARCH_DAYS,
} from "./dateWindow.ts";

test("enumerateDateWindow returns one date for a one-day window", () => {
  assert.deepEqual(
    enumerateDateWindow({
      start: "2026-09-09",
      end: "2026-09-09",
    }),
    ["2026-09-09"]
  );
});

test("enumerateDateWindow returns all dates inclusively for a three-day window", () => {
  assert.deepEqual(
    enumerateDateWindow({
      start: "2026-09-09",
      end: "2026-09-11",
    }),
    ["2026-09-09", "2026-09-10", "2026-09-11"]
  );
});

test("enumerateDateWindow handles month boundaries", () => {
  assert.deepEqual(
    enumerateDateWindow({
      start: "2026-09-30",
      end: "2026-10-02",
    }),
    ["2026-09-30", "2026-10-01", "2026-10-02"]
  );
});

test("enumerateDateWindow handles year boundaries", () => {
  assert.deepEqual(
    enumerateDateWindow({
      start: "2026-12-31",
      end: "2027-01-02",
    }),
    ["2026-12-31", "2027-01-01", "2027-01-02"]
  );
});

test("enumerateDateWindow handles leap day", () => {
  assert.deepEqual(
    enumerateDateWindow({
      start: "2028-02-28",
      end: "2028-03-01",
    }),
    ["2028-02-28", "2028-02-29", "2028-03-01"]
  );
});

test("enumerateDateWindow throws for malformed dates", () => {
  assert.throws(
    () =>
      enumerateDateWindow({
        start: "2026-09-31",
        end: "2026-10-01",
      }),
    /Invalid ISO date/
  );
});

test("enumerateDateWindow throws when start is after end", () => {
  assert.throws(
    () =>
      enumerateDateWindow({
        start: "2026-09-11",
        end: "2026-09-09",
      }),
    /cannot be after end/
  );
});

test("enumerateDateWindow throws when the window exceeds fourteen days", () => {
  const endDate = new Date("2026-09-01T00:00:00.000Z");
  endDate.setUTCDate(endDate.getUTCDate() + MAX_FLEXIBLE_SEARCH_DAYS);

  assert.throws(
    () =>
      enumerateDateWindow({
        start: "2026-09-01",
        end: endDate.toISOString().slice(0, 10),
      }),
    /maximum of 14 days/
  );
});

test("enumerateDateWindow is not affected by the local machine timezone", () => {
  const moduleUrl = pathToFileURL(
    new URL("./dateWindow.ts", import.meta.url).pathname
  ).href;
  const script = `
    import { enumerateDateWindow } from ${JSON.stringify(moduleUrl)};
    process.stdout.write(JSON.stringify(enumerateDateWindow({
      start: "2026-09-09",
      end: "2026-09-11",
    })));
  `;

  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    {
      env: {
        ...process.env,
        TZ: "Pacific/Honolulu",
      },
      encoding: "utf8",
    }
  );

  assert.deepEqual(JSON.parse(output), [
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
  ]);
});
