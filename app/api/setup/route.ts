import { NextResponse } from "next/server";

import { bootstrapAdmin, setSession } from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";

export async function POST(request: Request) {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password !== confirmPassword) {
    return NextResponse.redirect(buildRequestUrl(request, "/setup?error=" + encodeURIComponent("两次密码不一致。")), 303);
  }

  try {
    const user = await bootstrapAdmin({ name, email, password });
    await setSession(user.id);
    return NextResponse.redirect(buildRequestUrl(request, "/"), 303);
  } catch (error) {
    return NextResponse.redirect(
      buildRequestUrl(request, "/setup?error=" + encodeURIComponent(error instanceof Error ? error.message : "初始化失败。")),
      303,
    );
  }
}
