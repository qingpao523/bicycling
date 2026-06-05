import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { buildRequestUrl } from "@/lib/request-url";
import { saveUser } from "@/lib/storage";

function numberValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return Number(value);
}

export async function POST(request: Request) {
  const user = await requireUser();
  const formData = await request.formData();
  const intervalsApiKey = String(formData.get("intervalsApiKey") ?? "");
  const intervalsEmail = String(formData.get("intervalsEmail") ?? "").trim();
  const intervalsPassword = String(formData.get("intervalsPassword") ?? "").trim();

  await saveUser({
    ...user,
    name: String(formData.get("name") ?? user.name),
    weightKg: numberValue(formData.get("weightKg")),
    ftp: numberValue(formData.get("ftp")),
    thresholdHr: numberValue(formData.get("thresholdHr")),
    maxHr: numberValue(formData.get("maxHr")),
    restingHr: numberValue(formData.get("restingHr")),
    intervalsAthleteId: String(formData.get("intervalsAthleteId") ?? "").trim() || undefined,
    intervalsApiKeyEncrypted: intervalsApiKey ? encryptSecret(intervalsApiKey) : user.intervalsApiKeyEncrypted,
    intervalsEmailEncrypted: intervalsEmail ? encryptSecret(intervalsEmail) : user.intervalsEmailEncrypted,
    intervalsPasswordEncrypted: intervalsPassword ? encryptSecret(intervalsPassword) : user.intervalsPasswordEncrypted,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.redirect(
    buildRequestUrl(request, "/settings?success=" + encodeURIComponent("个人设置已保存。")),
    303,
  );
}
