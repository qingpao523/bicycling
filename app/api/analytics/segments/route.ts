import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listUserSegments, listAllSegmentEffortsByUser } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const [segments, efforts] = await Promise.all([
      listUserSegments(user.id),
      listAllSegmentEffortsByUser(user.id),
    ]);

    return NextResponse.json({
      segments: segments.map((s) => ({
        ...s,
        tags: s.tagsJson ? JSON.parse(s.tagsJson) : [],
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      totalEfforts: efforts.length,
      totalPrs: efforts.filter((e) => e.prRank === 1).length,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("redirect")) throw error;
    return NextResponse.json({ error: error instanceof Error ? error.message : "查询失败" }, { status: 500 });
  }
}
