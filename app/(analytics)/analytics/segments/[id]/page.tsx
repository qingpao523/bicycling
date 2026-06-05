import { requireUser } from "@/lib/auth";
import { listActivitiesByUser, listAllSegmentEffortsByUser } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { calculatePmc } from "@/lib/engine/pmc";
import { buildSegmentHistory, correlateSegmentWithTraining, predictSegmentEta, analyzeSegmentCausation } from "@/lib/engine/segments";
import { SegmentHistoryChart } from "@/components/analytics/segment-history-chart";
import { SegmentCorrelationChart } from "@/components/analytics/segment-correlation-chart";
import { SegmentPredictionCard } from "@/components/analytics/segment-prediction-card";
import { SegmentCausationCard } from "@/components/analytics/segment-causation-card";
import { SegmentMap } from "@/components/analytics/segment-map";
import { autoTagSegment } from "@/lib/engine/segments/segments-classify";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const segRecord = await prisma.segment.findUnique({ where: { id } });
  if (!segRecord) {
    return (
      <div>
        <div className="analytics-page-header"><h1>赛段未找到</h1></div>
        <Link href="/analytics/segments">← 返回赛段列表</Link>
      </div>
    );
  }

  const segment = {
    id: segRecord.id,
    stravaSegmentId: segRecord.stravaSegmentId,
    name: segRecord.name,
    distance: segRecord.distance,
    averageGrade: segRecord.averageGrade,
    maximumGrade: segRecord.maximumGrade ?? undefined,
    elevationHigh: segRecord.elevationHigh ?? undefined,
    elevationLow: segRecord.elevationLow ?? undefined,
    climbCategory: segRecord.climbCategory,
    city: segRecord.city ?? undefined,
    state: segRecord.state ?? undefined,
    country: segRecord.country ?? undefined,
    startLat: segRecord.startLat ?? undefined,
    startLng: segRecord.startLng ?? undefined,
    endLat: segRecord.endLat ?? undefined,
    endLng: segRecord.endLng ?? undefined,
    totalElevationGain: segRecord.totalElevationGain ?? undefined,
    tags: segRecord.tagsJson ? JSON.parse(segRecord.tagsJson) : undefined,
    createdAt: segRecord.createdAt.toISOString(),
    updatedAt: segRecord.updatedAt.toISOString(),
  };

  const [activities, allEfforts] = await Promise.all([
    listActivitiesByUser(user.id),
    listAllSegmentEffortsByUser(user.id),
  ]);

  const segEfforts = allEfforts
    .filter((e) => e.segmentId === id)
    .map((e) => ({
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
      createdAt: e.createdAt.toISOString(),
    }));

  const pmcData = calculatePmc(activities);
  const history = buildSegmentHistory(segEfforts, segment);
  const correlation = segEfforts.length >= 3
    ? correlateSegmentWithTraining({ efforts: segEfforts, segment, pmcData })
    : null;
  const prediction = history.bestTime > 0
    ? predictSegmentEta({ efforts: segEfforts, targetTime: Math.round(history.bestTime * 0.95) })
    : null;
  const causation = analyzeSegmentCausation({ efforts: segEfforts, segment, activities, pmcData });

  const tags = autoTagSegment(segment);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="analytics-page-header">
        <h1>🏔 {segment.name}</h1>
        <p>
          {(segment.distance / 1000).toFixed(1)}km · {segment.averageGrade.toFixed(1)}% ·
          {segEfforts.length} 次尝试 · {tags.join(" · ")}
        </p>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Link href="/analytics/segments" style={{ fontSize: "0.85rem", color: "var(--accent, #1f57d6)" }}>← 返回赛段列表</Link>
      </div>

      <SegmentMap segment={segment} />
      <SegmentHistoryChart history={history} segment={segment} />
      {correlation && <SegmentCorrelationChart correlation={correlation} />}
      {prediction && <SegmentPredictionCard prediction={prediction} segment={segment} />}
      <SegmentCausationCard causation={causation} />
    </div>
  );
}
