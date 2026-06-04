import { NextResponse } from "next/server";

import { createUser, requireAdmin } from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";
import { listUsers } from "@/lib/storage";

export async function GET() {
  await requireAdmin();
  return NextResponse.json(await listUsers());
}

export async function POST(request: Request) {
  await requireAdmin();
  const formData = await request.formData();

  try {
    await createUser({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    return NextResponse.redirect(
      buildRequestUrl(request, "/admin?success=" + encodeURIComponent("用户账号已创建。")),
      303,
    );
  } catch (error) {
    return NextResponse.redirect(
      buildRequestUrl(request, "/admin?error=" + encodeURIComponent(error instanceof Error ? error.message : "创建用户失败。")),
      303,
    );
  }
}
