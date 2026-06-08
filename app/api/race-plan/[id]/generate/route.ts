import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRacePlan, updateRacePlanTactics } from "@/lib/storage";
import { generateTactics } from "@/lib/ai-tactics";
import type { RouteProfile } from "@/lib/engine/gpx-parser";
import type { RiderProfile } from "@/lib/engine/tactics-engine";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const plan = await getRacePlan(id);
  if (!plan || plan.userId !== user.id) {
    return NextResponse.json({ error: "计划不存在" }, { status: 404 });
  }

  if (plan.riders.length === 0) {
    return NextResponse.json({ error: "请先添加骑手信息" }, { status: 400 });
  }

  const route: RouteProfile = JSON.parse(plan.routeJson);
  const riders: RiderProfile[] = plan.riders
    .filter((r) => r.ftp && r.weightKg)
    .map((r) => ({
      name: r.name,
      role: r.role as "self" | "teammate" | "opponent",
      ftp: r.ftp!,
      weightKg: r.weightKg!,
      wpKg5min: r.wpKg5min,
      wpKg1min: r.wpKg1min,
      strength: r.strength,
      weakness: r.weakness,
    }));

  if (riders.length === 0) {
    return NextResponse.json({ error: "至少需要一名骑手有 FTP 和体重数据" }, { status: 400 });
  }

  try {
    const tactics = await generateTactics(route, riders, plan.weatherNote ?? undefined);
    await updateRacePlanTactics(id, JSON.stringify(tactics));
    return NextResponse.json({ tactics });
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
