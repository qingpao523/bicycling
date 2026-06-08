import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRacePlan, addRacePlanRider, removeRacePlanRider } from "@/lib/storage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const plan = await getRacePlan(id);
  if (!plan || plan.userId !== user.id) {
    return NextResponse.json({ error: "计划不存在" }, { status: 404 });
  }

  const body = await request.json();
  const { role, name, ftp, weightKg, wpKg5min, wpKg1min, strength, weakness, note } = body;

  if (!role || !name?.trim()) {
    return NextResponse.json({ error: "角色和姓名必填" }, { status: 400 });
  }

  const rider = await addRacePlanRider({
    racePlanId: id,
    role,
    name: name.trim(),
    ftp: ftp ? Number(ftp) : undefined,
    weightKg: weightKg ? Number(weightKg) : undefined,
    wpKg5min: wpKg5min ? Number(wpKg5min) : undefined,
    wpKg1min: wpKg1min ? Number(wpKg1min) : undefined,
    strength: strength || undefined,
    weakness: weakness || undefined,
    note: note || undefined,
  });

  return NextResponse.json({ rider }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const plan = await getRacePlan(id);
  if (!plan || plan.userId !== user.id) {
    return NextResponse.json({ error: "计划不存在" }, { status: 404 });
  }

  const { riderId } = await request.json();
  if (!riderId) {
    return NextResponse.json({ error: "缺少 riderId" }, { status: 400 });
  }

  await removeRacePlanRider(riderId);
  return NextResponse.json({ ok: true });
}
