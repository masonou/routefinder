import assert from "node:assert/strict";
import test from "node:test";

import type { Itinerary } from "../types/itinerary.ts";
import {
  advanceSearchProgress,
  advanceSearchProgressForFoundRoute,
  COMPLETE_SEARCH_PROGRESS,
  countUniqueItineraries,
  getSearchProgressText,
  INITIAL_SEARCH_PROGRESS,
  MAX_SEARCH_PROGRESS_BEFORE_COMPLETE,
  SEARCH_PROGRESS_COMPLETION_COLLAPSE_MS,
  shouldHandleSearchProgressEvent,
} from "./searchProgressPresentation.ts";

test("search begins with an incomplete sticky-status progress value", () => {
  assert.equal(INITIAL_SEARCH_PROGRESS, 8);
  assert.ok(INITIAL_SEARCH_PROGRESS > 0);
  assert.ok(INITIAL_SEARCH_PROGRESS < 100);
  assert.equal(getSearchProgressText("searching", 0), "Finding the best stopover routes…");
});

test("streamed routes are counted uniquely and update searching copy", () => {
  const first = { id: "first" } as Itinerary;
  const second = { id: "second" } as Itinerary;
  const foundRouteCount = countUniqueItineraries([first, first, second]);

  assert.equal(foundRouteCount, 2);
  assert.equal(getSearchProgressText("searching", foundRouteCount), "Finding more routes… · 2 found");
});

test("soft progress stays monotonic and below completion while searching", () => {
  const afterTimer = advanceSearchProgress(89);
  const afterRoute = advanceSearchProgressForFoundRoute(afterTimer, 20);

  assert.ok(afterTimer >= 89);
  assert.ok(afterRoute >= afterTimer);
  assert.equal(afterRoute, MAX_SEARCH_PROGRESS_BEFORE_COMPLETE);
  assert.ok(afterRoute < 100);
});

test("completion reaches 100 and uses singular or plural route copy", () => {
  assert.equal(COMPLETE_SEARCH_PROGRESS, 100);
  assert.ok(SEARCH_PROGRESS_COMPLETION_COLLAPSE_MS >= 300);
  assert.ok(SEARCH_PROGRESS_COMPLETION_COLLAPSE_MS <= 700);
  assert.equal(getSearchProgressText("complete", 1), "✓ Search complete · 1 route found");
  assert.equal(getSearchProgressText("complete", 6), "✓ Search complete · 6 routes found");
});

test("stale or aborted searches cannot update the current status", () => {
  assert.equal(shouldHandleSearchProgressEvent(4, 3, false), false);
  assert.equal(shouldHandleSearchProgressEvent(4, 4, true), false);
  assert.equal(shouldHandleSearchProgressEvent(4, 4, false), true);
});

test("an immediate completion has final copy without waiting for soft progress", () => {
  assert.equal(getSearchProgressText("complete", 2), "✓ Search complete · 2 routes found");
});
