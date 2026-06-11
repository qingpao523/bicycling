import { requireUser } from "@/lib/auth";
import { listActivitiesByUser, listAllSegmentEffortsByUser } from "@/lib/storage";
import { handleSegmentFetchJob } from "@/lib/strava-sync";
import { StravaRateLimitError } from "@/lib/strava";
import type { User } from "@/lib/types";

export const maxDuration = 600;
export const dynamic = "force-dynamic";

const STRAVA_DELAY_MS = 10_000; // 100 req/15min ≈ 9s per request
const ICU_DELAY_MS = 1_000;

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
          .filter((a) => {
            if (activityIdsWithSegments.has(a.id)) return false;
            // 过滤废数据：distance=0 且 time=0 的活动不可能有赛段
            if (a.distanceKm <= 0 && a.movingTimeMin <= 0) return false;
            return true;
          })
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
            if (error instanceof StravaRateLimitError) {
              const waitSec = error.retryAfterSeconds + 5;
              send({ type: "rate_limit", waitSeconds: waitSec, activityName: act.name });
              await new Promise((r) => setTimeout(r, waitSec * 1000));
              // 重试一次
              try {
                const result = await handleSegmentFetchJob(user as User, fakeJob as any);
                if (result.skipped) {
                  progress.skipped++;
                } else {
                  progress.succeeded++;
                }
              } catch (retryError) {
                progress.failed++;
                progress.errors.push({
                  activityId: act.id,
                  name: act.name,
                  error: retryError instanceof Error ? retryError.message : String(retryError),
                });
              }
            } else {
              progress.failed++;
              progress.errors.push({
                activityId: act.id,
                name: act.name,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          progress.processed++;
          send({ type: "progress", progress });

          // 根据活动来源选择延迟：Strava API 严格限流
          const isStravaRoute = act.externalActivityId.startsWith("strava:") ||
            (!act.externalActivityId.startsWith("i") && user.stravaAccessTokenEncrypted);
          await new Promise((r) => setTimeout(r, isStravaRoute ? STRAVA_DELAY_MS : ICU_DELAY_MS));
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
