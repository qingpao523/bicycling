import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { buildRequestUrl } from "@/lib/request-url";
import { getUserById, saveUser } from "@/lib/storage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;

  const user = await getUserById(id);
  if (!user) {
    return NextResponse.redirect(
      buildRequestUrl(request, "/admin?error=" + encodeURIComponent("用户不存在。")),
      303,
    );
  }

  const formData = await request.formData();
  const newPassword = String(formData.get("password") ?? "");

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.redirect(
      buildRequestUrl(request, "/admin?error=" + encodeURIComponent("密码至少需要 8 位。")),
      303,
    );
  }

  user.passwordHash = hashPassword(newPassword);
  user.updatedAt = new Date().toISOString();
  await saveUser(user);

  return NextResponse.redirect(
    buildRequestUrl(request, "/admin?success=" + encodeURIComponent(`${user.name} 的密码已重置。`)),
    303,
  );
}