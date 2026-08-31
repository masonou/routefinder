import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  formatDuration,
  formatFlightDate,
  formatFlightTime,
} from "./formatFlight.ts";

test("flight timestamp formatting keeps the local airport date and time", () => {
  assert.equal(formatFlightDate("2026-09-10T06:58:00"), "10 Sep");
  assert.equal(formatFlightTime("2026-09-10T06:58:00"), "06:58");
});

test("flight timestamp formatting does not shift due to timezone", () => {
  const moduleUrl = pathToFileURL(
    new URL("./formatFlight.ts", import.meta.url).pathname
  ).href;
  const script = `
    import { formatFlightDate, formatFlightTime } from ${JSON.stringify(moduleUrl)};
    process.stdout.write(JSON.stringify({
      date: formatFlightDate("2026-09-10T06:58:00"),
      time: formatFlightTime("2026-09-10T06:58:00"),
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
    date: "10 Sep",
    time: "06:58",
  });
});

test("duration formatting is compact and readable", () => {
  assert.equal(formatDuration(435), "7h 15m");
  assert.equal(formatDuration(360), "6h");
});
