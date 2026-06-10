import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { enqueueSyncJob, listActivitiesByUser, countActivitiesWithSegments, listAllSegmentEffortsByUser } from "@/lib/storage";
import { processPendingSyncJobs } from "@/lib/system-sync";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(parseInt(body.limit, 10) || 9999, 1);

    const activities = await listActivitiesByUser(user.id);

    const allEfforts = await listAllSegmentEffortsByUser(user.id);
    const activityIdsWithSegments = new Set(allEfforts.map((e) => e.activityId));

    const candidateActivities = activities
      .filter((a) => !activityIdsWithSegments.has(a.id))
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, limit);

    let enqueued = 0;
    for (let i = 0; i < candidateActivities.length; i++) {
      const act = candidateActivities[i];
      const availableAt = new Date(Date.now() + i * 6000).toISOString();
      await enqueueSyncJob({
        userId: user.id,
        source: act.source,
        jobType: "segment_fetch",
        reason: "manual_backfill",
        externalRef: `${act.externalActivityId}:segments`,
        payload: { activityId: act.id, externalActivityId: act.externalActivityId },
        availableAt,
      });
      enqueued++;
    }

    // 入队完成后立即启动一轮消费，不等 auto-patrol
    let kickstarted = 0;
    for (let round = 0; round < 3; round++) {
      const batch = await processPendingSyncJobs(12);
      kickstarted += batch.length;
      if (batch.length < 12) break;
    }

    return NextResponse.json({
      success: true,
      enqueued,
      kickstarted,
      totalActivities: activities.length,
      alreadyWithSegments: activityIdsWithSegments.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "补拉失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    const activities = await listActivitiesByUser(user.id);
    const withSegmentsCount = await countActivitiesWithSegments(user.id);
    const totalCount = activities.length;

    return NextResponse.json({
      totalActivities: totalCount,
      stravaActivities: totalCount,
      withSegments: withSegmentsCount,
      missingSegments: Math.max(0, totalCount - withSegmentsCount),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
