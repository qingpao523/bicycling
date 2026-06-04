import { NextResponse } from "next/server";

import { getAppConfig } from "@/lib/storage";

export async function GET() {
  await getAppConfig();
  return NextResponse.json({
    ok: true,
    service: "ai-cycling-mvp",
    now: new Date().toISOString(),
  });
}
