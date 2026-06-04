import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { backfillActivityStreams, getBackfillStats } from "@/lib/engine/stream-backfill";

export const maxDuration = 300; // 5 minutes for long operations

/**
 * GET - Return backfill stats
 */
export async function GET() {
  try {
    const user = await requireUser();
    const stats = await getBackfillStats(user.id);
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST - Start backfill (batched, synchronous for small batches)
 * Body: { limit?: number, source?: "intervals.icu" | "strava" | "all", onlyWithPower?: boolean }
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));

    const limit = Math.min(Math.max(parseInt(body.limit, 10) || 50, 1), 200);
    const source = body.source ?? "all";
    const onlyWithPower = !!body.onlyWithPower;

    const progress = await backfillActivityStreams({
      userId: user.id,
      limit,
      source,
      onlyWithPower,
    });

    return NextResponse.json({ success: true, progress });
  } catch (error) {
    const message = error instanceof Error ? error.message : "补拉失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
