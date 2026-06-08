import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createRacePlan, listRacePlans } from "@/lib/storage";
import { parseGpx } from "@/lib/engine/gpx-parser";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const plans = await listRacePlans(user.id);
  return NextResponse.json({ plans });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const formData = await request.formData();
  const name = formData.get("name") as string;
  const gpxFile = formData.get("gpx") as File | null;
  const weatherNote = (formData.get("weatherNote") as string) || undefined;
  const raceDate = (formData.get("raceDate") as string) || undefined;

  if (!name?.trim()) {
    return NextResponse.json({ error: "请输入计划名称" }, { status: 400 });
  }

  if (!gpxFile || gpxFile.size === 0) {
    return NextResponse.json({ error: "请上传 GPX 文件" }, { status: 400 });
  }

  const gpxText = await gpxFile.text();
  const route = parseGpx(gpxText);

  if (route.segments.length === 0) {
    return NextResponse.json({ error: "GPX 文件解析失败，未找到有效轨迹点" }, { status: 400 });
  }

  const plan = await createRacePlan({
    userId: user.id,
    name: name.trim(),
    routeJson: JSON.stringify(route),
    gpxFileName: gpxFile.name,
    weatherNote,
    raceDate,
  });

  return NextResponse.json({ plan }, { status: 201 });
}
