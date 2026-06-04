import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { fetchIntervalsProfile } from "@/lib/intervals";
import { buildRequestUrl } from "@/lib/request-url";
import { saveUser } from "@/lib/storage";
import { fetchStravaAthlete } from "@/lib/strava";
import { resolveStravaAccessToken } from "@/lib/strava-sync";

function preferUserOverride(current?: number, previousSynced?: number, nextSynced?: number) {
  if (typeof nextSynced !== "number") return current;
  if (typeof current !== "number") return nextSynced;
  if (typeof previousSynced === "number" && current === previousSynced) return nextSynced;
  return current;
}

export async function POST(request: Request) {
  const user = await requireUser();

  try {
    let nextUser = user;
    const completed: string[] = [];

    if (user.intervalsApiKeyEncrypted) {
      const apiKey = decryptSecret(user.intervalsApiKeyEncrypted);
      const profile = await fetchIntervalsProfile({
        athleteId: user.intervalsAthleteId,
        apiKey,
      });

      nextUser = await saveUser({
        ...nextUser,
        intervalsAthleteId: profile.athleteId || nextUser.intervalsAthleteId,
        weightKg: preferUserOverride(nextUser.weightKg, nextUser.syncedWeightKg, profile.weightKg),
        ftp: preferUserOverride(nextUser.ftp, nextUser.syncedFtp, profile.ftp),
        thresholdHr: preferUserOverride(nextUser.thresholdHr, nextUser.syncedThresholdHr, profile.thresholdHr),
        maxHr: preferUserOverride(nextUser.maxHr, nextUser.syncedMaxHr, profile.maxHr),
        restingHr: preferUserOverride(nextUser.restingHr, nextUser.syncedRestingHr, profile.restingHr),
        syncedWeightKg: profile.weightKg,
        syncedFtp: profile.ftp,
        syncedThresholdHr: profile.thresholdHr,
        syncedMaxHr: profile.maxHr,
        syncedRestingHr: profile.restingHr,
        intervalsRawProfileJson: profile.rawAthlete,
        intervalsRawWellnessJson: profile.rawWellness,
        updatedAt: new Date().toISOString(),
      });
      completed.push("intervals.icu");
    }

    if (nextUser.stravaAccessTokenEncrypted) {
      const { accessToken, nextUser: refreshedUser } = await resolveStravaAccessToken(nextUser);
      const athlete = await fetchStravaAthlete(accessToken);
      nextUser = await saveUser({
        ...refreshedUser,
        stravaAthleteId: typeof athlete.id === "number" ? String(athlete.id) : refreshedUser.stravaAthleteId,
        stravaRawAthleteJson: athlete,
        updatedAt: new Date().toISOString(),
      });
      completed.push("Strava");
    }

    if (!completed.length) {
      return NextResponse.redirect(
        buildRequestUrl(request, "/settings?error=" + encodeURIComponent("暂无可同步的个人信息来源，请先连接 ICU 或 Strava。")),
        303,
      );
    }

    return NextResponse.redirect(
      buildRequestUrl(request, "/settings?success=" + encodeURIComponent(`个人信息同步完成：${completed.join(" + ")}。未同步活动数据。`)),
      303,
    );
  } catch (error) {
    return NextResponse.redirect(
      buildRequestUrl(request, "/settings?error=" + encodeURIComponent(error instanceof Error ? error.message : "个人信息同步失败。")),
      303,
    );
  }
}
