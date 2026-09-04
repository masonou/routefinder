import { runSearchRequest } from "@/lib/api/searchRequest";
import {
  createSearchProgressStreamSink,
  NDJSON_CONTENT_TYPE,
  type SearchProgressStreamSink,
} from "@/lib/api/searchStream";

export async function POST(request: Request): Promise<Response> {
  let progressSink: SearchProgressStreamSink | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sink = createSearchProgressStreamSink(controller);
      progressSink = sink;
      const onRequestAbort = () => sink.cancel();
      request.signal.addEventListener("abort", onRequestAbort, { once: true });
      if (request.signal.aborted) sink.cancel();
      try {
        const result = await runSearchRequest(request, {}, { onProgress: sink.emit });
        if (!("headers" in result)) {
          sink.emit({ type: "search_failed", ...result.body });
        }
      } catch {
        sink.emit({ type: "search_failed", error: "Flight search is currently unavailable. Please try again." });
      } finally {
        request.signal.removeEventListener("abort", onRequestAbort);
        sink.close();
      }
    },
    cancel() {
      progressSink?.cancel();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": NDJSON_CONTENT_TYPE,
      "Cache-Control": "no-store",
    },
  });
}
