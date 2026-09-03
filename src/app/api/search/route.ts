import { runSearchRequest } from "@/lib/api/searchRequest";
import { encodeSearchProgressEvent, NDJSON_CONTENT_TYPE } from "@/lib/api/searchStream";

export async function POST(request: Request): Promise<Response> {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: Parameters<typeof encodeSearchProgressEvent>[0]) =>
        controller.enqueue(encodeSearchProgressEvent(event));
      try {
        const result = await runSearchRequest(request, {}, { onProgress: emit });
        if (!("headers" in result)) {
          emit({ type: "search_failed", ...result.body });
        }
      } catch {
        emit({ type: "search_failed", error: "Flight search is currently unavailable. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": NDJSON_CONTENT_TYPE,
      "Cache-Control": "no-store",
    },
  });
}
