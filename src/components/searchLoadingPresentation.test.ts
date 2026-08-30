import assert from "node:assert/strict";
import test from "node:test";

import type { Itinerary } from "../types/itinerary.ts";
import { getResultsViewState } from "./resultsViewState.ts";
import {
  getNextSearchLoadingStatusIndex,
  getSearchLoadingAnnouncement,
  SEARCH_LOADING_MESSAGES,
  SEARCH_LOADING_STATUS_INTERVAL_MS,
  startSearchLoadingStatusRotation,
} from "./searchLoadingPresentation.ts";

test("loading view is used only while a search response is pending", () => {
  assert.equal(getResultsViewState(null, null), "loading");
  assert.equal(getResultsViewState([], null), "empty");
  assert.equal(getResultsViewState([{} as Itinerary], null), "results");
  assert.equal(getResultsViewState(null, "Search failed."), "error");
});

test("loading announcement uses the selected route and status copy stays presentation-only", () => {
  assert.equal(
    getSearchLoadingAnnouncement("BCN", "BKK"),
    "Searching for routes from BCN to BKK. Results will appear when ready.",
  );
  assert.equal(SEARCH_LOADING_MESSAGES.length, 5);
  assert.equal(getNextSearchLoadingStatusIndex(SEARCH_LOADING_MESSAGES.length - 1), 0);
});

test("loading status rotation is cleaned up when the component unmounts", () => {
  let scheduledDelay = 0;
  let scheduledTick: (() => void) | undefined;
  let clearedIntervalId: number | undefined;
  let tickCount = 0;

  const stopRotation = startSearchLoadingStatusRotation(
    () => {
      tickCount += 1;
    },
    (tick, delay) => {
      scheduledTick = tick;
      scheduledDelay = delay;
      return 42;
    },
    (intervalId) => {
      clearedIntervalId = intervalId;
    },
  );

  assert.equal(scheduledDelay, SEARCH_LOADING_STATUS_INTERVAL_MS);
  scheduledTick?.();
  assert.equal(tickCount, 1);
  stopRotation();
  assert.equal(clearedIntervalId, 42);
});
