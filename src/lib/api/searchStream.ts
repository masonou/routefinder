import type { SearchProgressEvent } from "../../types/search.ts";

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

type ProgressStreamController = Pick<
  ReadableStreamDefaultController<Uint8Array>,
  "close" | "desiredSize" | "enqueue"
>;

export interface SearchProgressStreamSink {
  emit(event: SearchProgressEvent): void;
  close(): void;
  cancel(): void;
}

export function encodeSearchProgressEvent(event: SearchProgressEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

/**
 * Owns the transport lifecycle for progressive search events. Planner callbacks
 * can continue after a browser has cancelled its response stream; those events
 * are intentionally discarded instead of becoming planner failures.
 */
export function createSearchProgressStreamSink(
  controller: ProgressStreamController,
): SearchProgressStreamSink {
  let inactive = false;

  function isInactive(): boolean {
    return inactive || controller.desiredSize === null;
  }

  return {
    emit(event) {
      if (isInactive()) {
        inactive = true;
        return;
      }

      try {
        controller.enqueue(encodeSearchProgressEvent(event));
      } catch (error) {
        // `desiredSize` becomes null once a stream closes/errors. Checking it
        // here handles the unavoidable race between the pre-enqueue check and
        // a client cancellation without suppressing unrelated write errors.
        if (controller.desiredSize === null) {
          inactive = true;
          return;
        }
        throw error;
      }
    },

    close() {
      if (isInactive()) {
        inactive = true;
        return;
      }

      inactive = true;
      try {
        controller.close();
      } catch (error) {
        if (controller.desiredSize === null) return;
        throw error;
      }
    },

    cancel() {
      inactive = true;
    },
  };
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
