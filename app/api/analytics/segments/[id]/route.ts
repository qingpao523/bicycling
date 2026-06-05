import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listActivitiesByUser, listAllSegmentEffortsByUser } from "@/lib/storage";
import { calculatePmc } from "@/lib/engine/pmc";
import { buildSegmentHistory, correlateSegmentWithTraining, predictSegmentEta, analyzeSegmentCausation, autoTagSegment, gradeSegmentAbility, classifySegment } from "@/lib/engine/segments";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const segRecord = await prisma.segment.findUnique({ where: { id } });
    if (!segRecord) {
      return NextResponse.json({ error: "赛段不存在" }, { status: 404 });
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
      totalElevationGain: segRecord.totalElevationGain ?? undefined,
      tags: segRecord.tagsJson ? JSON.parse(segRecord.tagsJson) : autoTagSegment(segRecord as any),
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
    const history = buildSegmentHistory(segEfforts, segment as any);
    const correlation = segEfforts.length >= 3
      ? correlateSegmentWithTraining({ efforts: segEfforts, segment: segment as any, pmcData })
      : null;
    const prediction = history.bestTime > 0
      ? predictSegmentEta({ efforts: segEfforts, targetTime: Math.round(history.bestTime * 0.95) })
      : null;
    const causation = analyzeSegmentCausation({ efforts: segEfforts, segment: segment as any, activities, pmcData });

    const weightKg = user.weightKg ?? user.syncedWeightKg;
    const bestWatts = segEfforts.reduce((max, e) => Math.max(max, e.averageWatts ?? 0), 0);
    const grade = bestWatts > 0 && weightKg
      ? gradeSegmentAbility({ segment: segment as any, bestEffortWkg: bestWatts / weightKg })
      : null;

    return NextResponse.json({
      segment,
      efforts: segEfforts,
      history,
      correlation,
      prediction,
      causation,
      grade,
      category: classifySegment(segment as any),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("redirect")) throw error;
    return NextResponse.json({ error: error instanceof Error ? error.message : "查询失败" }, { status: 500 });
  }
}
