import assert from "node:assert/strict";
import test from "node:test";

import { formatSearchFailureReference } from "./searchFailureReference.ts";

test("technical search errors expose a selectable support reference", () => {
  assert.equal(
    formatSearchFailureReference("SL-PROVIDER-UNAVAILABLE-7F3K9A"),
    "Reference: SL-PROVIDER-UNAVAILABLE-7F3K9A",
  );
});

test("no reference is rendered for outcomes without a technical failure", () => {
  assert.equal(formatSearchFailureReference(null), null);
});
