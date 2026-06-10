import { requireUser } from "@/lib/auth";
import { listActivitiesLightByUser, listUserSegments, listSegmentEffortsLightByUser, countActivitiesWithSegments } from "@/lib/storage";
import { calculatePmc } from "@/lib/engine/pmc";
import { gradeSegmentAbility, type SegmentAbilityGrade } from "@/lib/engine/segments";
import { SegmentsDashboard } from "@/components/analytics/segments-dashboard";
import { SegmentBackfillPanel } from "@/components/analytics/segment-backfill-panel";

export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  const user = await requireUser();
  const [activities, segments, allEfforts] = await Promise.all([
    listActivitiesLightByUser(user.id),
    listUserSegments(user.id),
    listSegmentEffortsLightByUser(user.id),
  ]);

  const pmcData = calculatePmc(activities);

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
    deviceWatts: e.deviceWatts ?? undefined,
    createdAt: e.createdAt.toISOString(),
  }));

  // Pre-compute grades server-side to avoid O(n²) on client
  const grades: Record<string, SegmentAbilityGrade> = {};
  if (user.weightKg) {
    const effortsBySegment = new Map<string, typeof allEfforts>();
    for (const e of allEfforts) {
      let arr = effortsBySegment.get(e.segmentId);
      if (!arr) { arr = []; effortsBySegment.set(e.segmentId, arr); }
      arr.push(e);
    }
    for (const seg of segments) {
      const segEfforts = effortsBySegment.get(seg.id);
      if (!segEfforts?.length) continue;
      const bestWatts = segEfforts.reduce((max, e) => Math.max(max, e.averageWatts ?? 0), 0);
      if (bestWatts > 0) {
        grades[seg.id] = gradeSegmentAbility({ segment: seg as any, bestEffortWkg: bestWatts / user.weightKg });
      }
    }
  }

  const stravaCount = activities.length;
  const withSegments = await countActivitiesWithSegments(user.id);

  if (!segments.length) {
    return (
      <div>
        <div className="analytics-page-header">
          <h1>🏔 赛段</h1>
          <p>暂无赛段数据 — 补拉后即可查看赛段分析</p>
        </div>
        <div className="analytics-card" style={{ padding: 32 }}>
          <h3 style={{ margin: "0 0 12px" }}>如何获取赛段数据</h3>
          <p style={{ color: "var(--muted)", marginBottom: 16, lineHeight: 1.7 }}>
            你有 <strong>{activities.length}</strong> 条活动，但尚未拉取赛段信息。
            赛段数据来自 intervals.icu，需要先确保活动已同步且有流数据 (watts/heartrate/altitude)。
          </p>
          <div style={{ marginBottom: 16, minWidth: 0 }}>
            <SegmentBackfillPanel stats={{
              totalActivities: activities.length,
              stravaActivities: stravaCount,
              withSegments: 0,
              missingSegments: activities.length,
            }} />
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: "0.85rem" }}>
            <a href="/settings" style={{ color: "var(--accent, #1f57d6)" }}>▶ 去设置页同步活动</a>
            <a href="/analytics/tools" style={{ color: "var(--accent, #1f57d6)" }}>▶ 去数据工具补拉流数据</a>
          </div>
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
        grades={grades}
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
