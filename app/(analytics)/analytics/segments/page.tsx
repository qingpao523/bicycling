import { requireUser } from "@/lib/auth";
import { listActivitiesByUser, listUserSegments, listAllSegmentEffortsByUser, countActivitiesWithSegments, countActivitiesWithoutSegments } from "@/lib/storage";
import { calculatePmc } from "@/lib/engine/pmc";
import { SegmentsDashboard } from "@/components/analytics/segments-dashboard";

export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  const user = await requireUser();
  const [activities, segments, allEfforts] = await Promise.all([
    listActivitiesByUser(user.id),
    listUserSegments(user.id),
    listAllSegmentEffortsByUser(user.id),
  ]);

  const pmcData = calculatePmc(activities);

  // Convert Prisma dates to ISO strings for client component
  const segmentsForClient = segments.map((s) => ({
    id: s.id,
    stravaSegmentId: s.stravaSegmentId,
    name: s.name,
    distance: s.distance,
    averageGrade: s.averageGrade,
    maximumGrade: s.maximumGrade ?? undefined,
    elevationHigh: s.elevationHigh ?? undefined,
    elevationLow: s.elevationLow ?? undefined,
    climbCategory: s.climbCategory,
    city: s.city ?? undefined,
    state: s.state ?? undefined,
    country: s.country ?? undefined,
    startLat: s.startLat ?? undefined,
    startLng: s.startLng ?? undefined,
    endLat: s.endLat ?? undefined,
    endLng: s.endLng ?? undefined,
    totalElevationGain: s.totalElevationGain ?? undefined,
    tags: s.tagsJson ? JSON.parse(s.tagsJson) : undefined,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  const effortsForClient = allEfforts.map((e) => ({
    id: e.id,
    segmentId: e.segmentId,
    activityId: e.activityId,
    userId: e.userId,
    stravaEffortId: e.stravaEffortId,
    elapsedTime: e.elapsedTime,
    movingTime: e.movingTime,
    startDate: e.startDate.toISOString(),
    averageWatts: e.averageWatts ?? undefined,
    averageHr: e.averageHr ?? undefined,
    maxHr: e.maxHr ?? undefined,
    prRank: e.prRank ?? undefined,
    komRank: e.komRank ?? undefined,
    achievements: e.achievementsJson ? JSON.parse(e.achievementsJson) : undefined,
    deviceWatts: e.deviceWatts ?? undefined,
    createdAt: e.createdAt.toISOString(),
    segment: e.segment ? {
      id: e.segment.id,
      stravaSegmentId: e.segment.stravaSegmentId,
      name: e.segment.name,
      distance: e.segment.distance,
      averageGrade: e.segment.averageGrade,
      maximumGrade: e.segment.maximumGrade ?? undefined,
      climbCategory: e.segment.climbCategory,
      createdAt: e.segment.createdAt.toISOString(),
      updatedAt: e.segment.updatedAt.toISOString(),
    } : undefined,
  }));

  const stravaCount = activities.filter((a) => a.source === "strava" || a.externalActivityId.startsWith("strava:")).length;
  const withSegments = await countActivitiesWithSegments(user.id);

  if (!segments.length) {
    return (
      <div>
        <div className="analytics-page-header">
          <h1>🏔 赛段</h1>
          <p>暂无赛段数据 — 需要先同步 Strava 活动并补拉赛段信息</p>
        </div>
        <div className="analytics-card" style={{ textAlign: "center", padding: 40 }}>
          <p style={{ color: "var(--muted)", marginBottom: 16 }}>
            系统在同步 Strava 活动时会自动拉取赛段数据。如果已有活动但无赛段, 请在"工具"中手动触发补拉。
          </p>
          <a href="/settings" style={{ color: "var(--accent, #1f57d6)" }}>▶ 去设置页同步 Strava</a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="analytics-page-header">
        <h1>🏔 赛段</h1>
        <p>{segments.length} 个赛段 · {allEfforts.length} 次尝试 · {effortsForClient.filter((e) => e.prRank === 1).length} 个 PR</p>
      </div>
      <SegmentsDashboard
        segments={segmentsForClient as any}
        efforts={effortsForClient as any}
        activities={activities}
        pmcData={pmcData}
        user={{ ftp: user.ftp, weightKg: user.weightKg ?? user.syncedWeightKg ?? undefined }}
        backfillStats={{
          totalActivities: activities.length,
          stravaActivities: stravaCount,
          withSegments,
          missingSegments: Math.max(0, stravaCount - withSegments),
        }}
      />
    </div>
  );
}
