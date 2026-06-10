import { requireUser } from "@/lib/auth";
import { listActivitiesByUser, listAllSegmentEffortsByUser } from "@/lib/storage";
import { handleSegmentFetchJob } from "@/lib/strava-sync";
import type { User } from "@/lib/types";

export const maxDuration = 600;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const limit = Math.max(parseInt(body.limit, 10) || 9999, 1);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      try {
        const activities = await listActivitiesByUser(user.id);
        const allEfforts = await listAllSegmentEffortsByUser(user.id);
        const activityIdsWithSegments = new Set(allEfforts.map((e) => e.activityId));

        const candidates = activities
          .filter((a) => !activityIdsWithSegments.has(a.id))
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
          .slice(0, limit);

        const progress = {
          total: candidates.length,
          processed: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          currentActivity: undefined as string | undefined,
          errors: [] as { activityId: string; name: string; error: string }[],
        };

        send({ type: "progress", progress });

        for (const act of candidates) {
          progress.currentActivity = act.name;
          send({ type: "progress", progress });

          const fakeJob = {
            id: `manual-${act.id}`,
            userId: user.id,
            source: act.source,
            jobType: "segment_fetch" as const,
            status: "processing" as const,
            reason: "manual_backfill",
            externalRef: `${act.externalActivityId}:segments`,
            payload: { activityId: act.id, externalActivityId: act.externalActivityId },
            availableAt: new Date().toISOString(),
            attempts: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          try {
            const result = await handleSegmentFetchJob(user as User, fakeJob as any);
            if (result.skipped) {
              progress.skipped++;
              progress.errors.push({ activityId: act.id, name: act.name, error: `跳过: ${result.skipped}` });
            } else {
              progress.succeeded++;
            }
          } catch (error) {
            progress.failed++;
            progress.errors.push({
              activityId: act.id,
              name: act.name,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          progress.processed++;
          send({ type: "progress", progress });

          await new Promise((r) => setTimeout(r, 200));
        }

        progress.currentActivity = undefined;
        send({ type: "done", progress });
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
