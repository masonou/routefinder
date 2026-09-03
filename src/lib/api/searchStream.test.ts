import assert from "node:assert/strict";
import test from "node:test";

import { consumeNdjsonBuffer, encodeSearchProgressEvent } from "./searchStream.ts";
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
