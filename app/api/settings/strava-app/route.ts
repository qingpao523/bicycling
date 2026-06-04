import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { buildRequestUrl } from "@/lib/request-url";
import { saveUser } from "@/lib/storage";

export async function POST(request: Request) {
  const user = await requireUser();
  const formData = await request.formData();
  const personalClientId = String(formData.get("stravaPersonalClientId") ?? "").trim();
  const personalClientSecret = String(formData.get("stravaPersonalClientSecret") ?? "").trim();

  await saveUser({
    ...user,
    stravaPersonalClientId: personalClientId || undefined,
    stravaPersonalClientSecretEncrypted: personalClientId
      ? personalClientSecret
        ? encryptSecret(personalClientSecret)
        : user.stravaPersonalClientSecretEncrypted
      : undefined,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.redirect(
    buildRequestUrl(request, "/settings?success=" + encodeURIComponent("Strava 个人应用配置已保存。")),
    303,
  );
}
