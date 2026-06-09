import { requireUser } from "@/lib/auth";
import { backfillActivityStreams } from "@/lib/engine/stream-backfill";

export const maxDuration = 600; // 10 minutes
export const dynamic = "force-dynamic";

/**
 * POST - Start backfill with Server-Sent Events progress stream.
 * Body: { limit?: number, source?: string, onlyWithPower?: boolean }
 */
export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));

  const limit = Math.max(parseInt(body.limit, 10) || 9999, 1);
  const source = body.source ?? "all";
  const onlyWithPower = !!body.onlyWithPower;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      try {
        const final = await backfillActivityStreams({
          userId: user.id,
          limit,
          source,
          onlyWithPower,
          onProgress: (progress) => send({ type: "progress", progress }),
        });
        send({ type: "done", progress: final });
      } catch (error) {
        const message = error instanceof Error ? error.message : "补拉失败";
        send({ type: "error", error: message });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
