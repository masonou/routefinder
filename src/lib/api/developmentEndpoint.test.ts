import assert from "node:assert/strict";
import test from "node:test";

import { getDevelopmentEndpointUnavailableStatus } from "./developmentEndpoint.ts";

test("production development endpoints return 404", () => {
  const status = getDevelopmentEndpointUnavailableStatus("production");

  assert.equal(status, 404);
});

test("development endpoints remain available outside production", () => {
  assert.equal(getDevelopmentEndpointUnavailableStatus("development"), undefined);
  assert.equal(getDevelopmentEndpointUnavailableStatus("test"), undefined);
});
