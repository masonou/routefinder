import type { SearchProgressEvent } from "../../types/search.ts";

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export function encodeSearchProgressEvent(event: SearchProgressEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

/** Parses complete NDJSON records and retains an incomplete trailing record. */
export function consumeNdjsonBuffer(
  buffer: string,
  onEvent: (event: SearchProgressEvent) => void,
): string {
  const lines = buffer.split("\n");
  const trailing = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value !== "object" || value === null || !("type" in value)) continue;
      onEvent(value as SearchProgressEvent);
    } catch {
      // A corrupt event must not discard other valid records in the stream.
    }
  }
  return trailing;
}
