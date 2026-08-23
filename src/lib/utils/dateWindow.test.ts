import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  addCalendarDays,
  calendarDayDifference,
  enumerateDateWindow,
  MAX_FLEXIBLE_SEARCH_DAYS,
} from "./dateWindow.ts";

test("addCalendarDays derives the inclusive four-date departure window", () => {
  assert.equal(addCalendarDays("2026-08-17", 3), "2026-08-20");
  assert.deepEqual(
    enumerateDateWindow({ start: "2026-08-17", end: addCalendarDays("2026-08-17", 3) }),
    ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20"]
  );
});

test("addCalendarDays handles month, year, and leap-day boundaries", () => {
  assert.equal(addCalendarDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addCalendarDays("2028-02-29", 1), "2028-03-01");
});

test("calendarDayDifference uses calendar dates for hub stays", () => {
  assert.equal(calendarDayDifference("2026-09-01", "2026-09-03"), 2);
  assert.equal(calendarDayDifference("2026-09-01", "2026-09-05"), 4);
  assert.equal(calendarDayDifference("2026-09-01", "2026-09-07"), 6);
});

test("addCalendarDays rejects malformed calendar dates", () => {
  assert.throws(() => addCalendarDays("2026-02-30", 1), /Invalid ISO date/);
});

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
    import { addCalendarDays, enumerateDateWindow } from ${JSON.stringify(moduleUrl)};
    process.stdout.write(JSON.stringify({
      dates: enumerateDateWindow({ start: "2026-09-09", end: "2026-09-11" }),
      addedDate: addCalendarDays("2026-09-30", 3),
    }));
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

  assert.deepEqual(JSON.parse(output), {
    dates: ["2026-09-09", "2026-09-10", "2026-09-11"],
    addedDate: "2026-10-03",
  });
});
