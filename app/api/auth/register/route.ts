import { NextResponse } from "next/server";

import { createUser, setSession } from "@/lib/auth";
import { buildRequestUrl } from "@/lib/request-url";
import { getAppConfig } from "@/lib/storage";

export async function POST(request: Request) {
  const config = await getAppConfig();
  if (config.authMode !== "open_registration") {
    return NextResponse.redirect(buildRequestUrl(request, "/login"), 303);
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password !== confirmPassword) {
    return NextResponse.redirect(buildRequestUrl(request, "/register?error=" + encodeURIComponent("两次密码不一致。")), 303);
  }

  try {
    const user = await createUser({ name, email, password });
    await setSession(user.id);
    return NextResponse.redirect(buildRequestUrl(request, "/"), 303);
  } catch (error) {
    return NextResponse.redirect(
      buildRequestUrl(request, "/register?error=" + encodeURIComponent(error instanceof Error ? error.message : "注册失败。")),
      303,
    );
  }
}
