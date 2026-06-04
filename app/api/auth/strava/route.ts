import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createId } from "@/lib/storage";
import { buildStravaAuthorizeUrl, getDefaultStravaScope, getStravaRedirectUri, resolveStravaClientCredentials } from "@/lib/strava";

const STRAVA_STATE_COOKIE = "ai_cycling_strava_state";
const STRAVA_APP_COOKIE = "ai_cycling_strava_app";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const requestedApp = url.searchParams.get("app") === "personal" ? "personal" : "platform";

  const credentials = resolveStravaClientCredentials(user, requestedApp);
  const clientId = credentials.clientId;
  if (!clientId) {
    return NextResponse.redirect(
      new URL(
        "/settings?error=" +
          encodeURIComponent(requestedApp === "personal" ? "请先填写个人 Strava 应用 ID。" : "未配置 STRAVA_CLIENT_ID。"),
        request.url,
      ),
      303,
    );
  }

  const state = createId("strava");
  const cookieStore = await cookies();
  cookieStore.set(STRAVA_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  cookieStore.set(STRAVA_APP_COOKIE, requestedApp, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  const redirectUri = getStravaRedirectUri(request);
  const authorizeUrl = buildStravaAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    scope: getDefaultStravaScope(),
  });

  return NextResponse.redirect(authorizeUrl, 303);
}
