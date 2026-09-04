import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeNdjsonBuffer,
  createSearchProgressStreamSink,
  encodeSearchProgressEvent,
} from "./searchStream.ts";
import type { SearchProgressEvent } from "../../types/search.ts";

test("NDJSON parsing accepts multiple records from one network chunk", () => {
  const received: SearchProgressEvent[] = [];
  const buffer = consumeNdjsonBuffer(
    '{"type":"search_started"}\n{"type":"search_failed","error":"Unavailable"}\n',
    (event) => received.push(event),
  );
  assert.equal(buffer, "");
  assert.deepEqual(received.map((event) => event.type), ["search_started", "search_failed"]);
});

test("NDJSON parsing retains a split record until its terminating newline arrives", () => {
  const received: SearchProgressEvent[] = [];
  let buffer = consumeNdjsonBuffer('{"type":"search_sta', (event) => received.push(event));
  assert.equal(received.length, 0);
  buffer = consumeNdjsonBuffer(`${buffer}rted"}\n`, (event) => received.push(event));
  assert.equal(buffer, "");
  assert.equal(received[0]?.type, "search_started");
});

test("NDJSON final trailing record and malformed records fail safely", () => {
  const received: SearchProgressEvent[] = [];
  let buffer = consumeNdjsonBuffer('{bad}\n{"type":"search_started"}', (event) => received.push(event));
  assert.equal(received.length, 0);
  buffer = consumeNdjsonBuffer(`${buffer}\n`, (event) => received.push(event));
  assert.equal(buffer, "");
  assert.equal(received[0]?.type, "search_started");
});

test("search events are encoded as newline-delimited JSON", () => {
  const text = new TextDecoder().decode(encodeSearchProgressEvent({ type: "search_started" }));
  assert.equal(text, '{"type":"search_started"}\n');
});

test("normal progressive events remain ordered and completion closes once", () => {
  const chunks: Uint8Array[] = [];
  let desiredSize: number | null = 1;
  let closeCalls = 0;
  const firstItinerary = { id: "first" } as Extract<SearchProgressEvent, { type: "itinerary_found" }> ["itinerary"];
  const secondItinerary = { id: "second" } as Extract<SearchProgressEvent, { type: "itinerary_found" }> ["itinerary"];
  const result = {
    count: 2,
    itineraries: [firstItinerary, secondItinerary],
    twoStopDiscovery: { explored: false, canExplore: false, reason: "unavailable" },
  } as Extract<SearchProgressEvent, { type: "search_complete" }> ["result"];
  const sink = createSearchProgressStreamSink({
    get desiredSize() { return desiredSize; },
    enqueue(chunk) {
      if (chunk) chunks.push(chunk);
    },
    close() {
      closeCalls += 1;
      desiredSize = null;
    },
  });

  sink.emit({ type: "search_started" });
  sink.emit({ type: "itinerary_found", category: "direct", itinerary: firstItinerary });
  sink.emit({ type: "itinerary_found", category: "one_stop", itinerary: secondItinerary });
  sink.emit({ type: "search_complete", result });
  sink.close();
  sink.close();

  assert.equal(closeCalls, 1);
  assert.deepEqual(
    chunks.map((chunk) => JSON.parse(new TextDecoder().decode(chunk)) as SearchProgressEvent).map((event) => event.type),
    ["search_started", "itinerary_found", "itinerary_found", "search_complete"],
  );
});

test("progress events are discarded after client cancellation", () => {
  const chunks: Uint8Array[] = [];
  let closeCalls = 0;
  const sink = createSearchProgressStreamSink({
    get desiredSize() { return 1; },
    enqueue(chunk) {
      if (chunk) chunks.push(chunk);
    },
    close() { closeCalls += 1; },
  });

  sink.emit({ type: "search_started" });
  sink.cancel();
  assert.doesNotThrow(() => sink.emit({ type: "search_failed", error: "discarded" }));
  sink.close();

  assert.equal(closeCalls, 0);
  assert.deepEqual(
    chunks.map((chunk) => new TextDecoder().decode(chunk)),
    ['{"type":"search_started"}\n'],
  );
});

test("an enqueue race with a closed controller becomes an inactive progress sink", () => {
  let desiredSize: number | null = 1;
  let enqueueCalls = 0;
  const sink = createSearchProgressStreamSink({
    get desiredSize() { return desiredSize; },
    enqueue() {
      enqueueCalls += 1;
      desiredSize = null;
      throw new TypeError("controller closed while enqueueing");
    },
    close() {},
  });

  assert.doesNotThrow(() => sink.emit({ type: "search_started" }));
  assert.doesNotThrow(() => sink.emit({ type: "search_failed", error: "discarded" }));
  assert.equal(enqueueCalls, 1);
});

test("unexpected stream write errors are not hidden", () => {
  const sink = createSearchProgressStreamSink({
    get desiredSize() { return 1; },
    enqueue() { throw new Error("encoder is broken"); },
    close() {},
  });

  assert.throws(() => sink.emit({ type: "search_started" }), /encoder is broken/);
});
