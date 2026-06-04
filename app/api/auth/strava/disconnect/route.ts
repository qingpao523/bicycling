import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { saveUser } from "@/lib/storage";
import { buildRequestUrl } from "@/lib/request-url";

export async function POST(request: Request) {
  const user = await requireUser();

  await saveUser({
    ...user,
    stravaAthleteId: undefined,
    stravaScopes: undefined,
    stravaAuthSource: undefined,
    stravaAccessTokenEncrypted: undefined,
    stravaRefreshTokenEncrypted: undefined,
    stravaTokenExpiresAt: undefined,
    stravaRawAthleteJson: undefined,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.redirect(
    buildRequestUrl(request, "/settings?success=" + encodeURIComponent("Strava 已断开连接。")),
    303,
  );
}
