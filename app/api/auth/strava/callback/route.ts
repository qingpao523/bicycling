import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { enqueueSyncJob, saveUser } from "@/lib/storage";
import { exchangeStravaCode, fetchStravaAthlete, resolveStravaClientCredentials } from "@/lib/strava";

const STRAVA_STATE_COOKIE = "ai_cycling_strava_state";
const STRAVA_APP_COOKIE = "ai_cycling_strava_app";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/settings?error=" + encodeURIComponent(`Strava 授权失败：${error}`), request.url), 303);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STRAVA_STATE_COOKIE)?.value;
  const stravaApp = cookieStore.get(STRAVA_APP_COOKIE)?.value === "personal" ? "personal" : "platform";
  cookieStore.delete(STRAVA_STATE_COOKIE);
  cookieStore.delete(STRAVA_APP_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/settings?error=" + encodeURIComponent("Strava 授权状态校验失败，请重试。"), request.url), 303);
  }

  const credentials = resolveStravaClientCredentials(user, stravaApp);
  const clientId = credentials.clientId;
  const clientSecret = credentials.clientSecret;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(
        "/settings?error=" +
          encodeURIComponent(stravaApp === "personal" ? "个人 Strava 应用 ID / Key 未配置完整。" : "Strava OAuth 环境变量未配置完整。"),
        request.url,
      ),
      303,
    );
  }

  try {
    const token = await exchangeStravaCode({
      clientId,
      clientSecret,
      code,
    });
    const athlete = await fetchStravaAthlete(token.access_token);

    await saveUser({
      ...user,
      stravaAthleteId: token.athlete?.id ? String(token.athlete.id) : user.stravaAthleteId,
      stravaScopes: url.searchParams.get("scope") ?? user.stravaScopes,
      stravaAuthSource: credentials.app,
      stravaAccessTokenEncrypted: encryptSecret(token.access_token),
      stravaRefreshTokenEncrypted: encryptSecret(token.refresh_token),
      stravaTokenExpiresAt: new Date(token.expires_at * 1000).toISOString(),
      stravaRawAthleteJson: athlete,
      updatedAt: new Date().toISOString(),
    });

    await enqueueSyncJob({
      userId: user.id,
      source: "strava",
      jobType: "sync",
      reason: "oauth_init",
      externalRef: `user:${user.id}:strava:init`,
      payload: {
        mode: "incremental",
        after: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    return NextResponse.redirect(
      new URL(
        "/settings?success=" + encodeURIComponent(`Strava 已连接（${credentials.app === "personal" ? "个人应用" : "平台应用"}），初始化同步任务已入队。`),
        request.url,
      ),
      303,
    );
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "unknown";
    return NextResponse.redirect(new URL("/settings?error=" + encodeURIComponent(message), request.url), 303);
  }
}
