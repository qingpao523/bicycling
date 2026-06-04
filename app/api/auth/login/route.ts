import { NextResponse } from "next/server";

import { loginWithPassword } from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await loginWithPassword(email, password);
    return NextResponse.redirect(buildRequestUrl(request, "/"), 303);
  } catch (error) {
    return NextResponse.redirect(
      buildRequestUrl(request, "/login?error=" + encodeURIComponent(error instanceof Error ? error.message : "登录失败。")),
      303,
    );
  }
}
