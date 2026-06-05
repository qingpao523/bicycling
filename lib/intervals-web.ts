/**
 * intervals.icu Web Session 链路
 * 用邮箱+密码 cookie 登录，下载 Strava 来源活动的 .fit 文件，重新上传让 API 能读
 * 移植自 github.com/CarnoZhao/intervals-icu-sync 的 sync.py
 */

import { decryptSecret } from "@/lib/crypto";
import type { User } from "@/lib/types";

const ICU_BASE = "https://intervals.icu";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

function basicAuthHeader(apiKey: string) {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`;
}

/**
 * 用邮箱+密码登录 intervals.icu Web，返回 cookie string
 */
async function webLogin(email: string, password: string): Promise<string> {
  const formData = new FormData();
  formData.append("email", email);
  formData.append("password", password);

  const response = await fetch(`${ICU_BASE}/api/login?deviceClass=desktop`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: `${ICU_BASE}/`,
      "User-Agent": UA,
    },
    body: formData,
    redirect: "manual",
  });

  if (response.status !== 200) {
    const text = await response.text().catch(() => "");
    throw new Error(`intervals.icu Web 登录失败: HTTP ${response.status} ${text.slice(0, 200)}`);
  }

  const setCookies = response.headers.getSetCookie?.() ?? [];
  const cookieStr = setCookies
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");

  if (!cookieStr) {
    throw new Error("intervals.icu 登录成功但未返回 cookie");
  }

  return cookieStr;
}

/**
 * 用 Web Session 下载活动的 .fit 文件
 */
async function downloadFit(activityId: string, cookie: string): Promise<Buffer | null> {
  const metaRes = await fetch(`${ICU_BASE}/api/activity/${activityId}`, {
    headers: {
      Cookie: cookie,
      Accept: "application/json",
      "User-Agent": UA,
      Referer: `${ICU_BASE}/`,
    },
  });

  if (!metaRes.ok) return null;

  const meta = (await metaRes.json()) as Record<string, unknown>;
  if (!meta.analyzed) return null;

  const fitRes = await fetch(`${ICU_BASE}/api/activity/${activityId}/fit-file`, {
    headers: {
      Cookie: cookie,
      "User-Agent": UA,
      Referer: `${ICU_BASE}/`,
    },
  });

  if (!fitRes.ok) return null;

  const buf = Buffer.from(await fitRes.arrayBuffer());
  if (buf.length < 1024) return null;

  return buf;
}

/**
 * 用 API Key 上传 .fit 文件回 intervals.icu
 */
async function uploadFit(
  athleteId: string,
  apiKey: string,
  stravaActivityId: string,
  fitBuffer: Buffer,
): Promise<{ status: number; body: string }> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(fitBuffer)], { type: "application/octet-stream" }),
    `${stravaActivityId}.fit`,
  );

  const response = await fetch(
    `${ICU_BASE}/api/v1/athlete/${athleteId}/activities?external_id=${stravaActivityId}`,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(apiKey),
        "User-Agent": "icu-auto-reload/1.0",
      },
      body: formData,
    },
  );

  const body = await response.text();
  return { status: response.status, body };
}

export type ReloadResult = {
  total: number;
  uploaded: number;
  skippedNotAnalyzed: number;
  skippedType: number;
  failed: number;
};

/**
 * 扫描并修复用户的 Strava 空壳活动
 * @param user 用户 (需 intervalsEmailEncrypted + intervalsPasswordEncrypted + intervalsApiKeyEncrypted + intervalsAthleteId)
 * @param days 回扫天数
 * @param allowedTypes 允许的活动类型 (默认只 Ride 类)
 */
export async function reloadStravaActivitiesViaWeb(
  user: User,
  days = 7,
  allowedTypes = new Set(["Ride", "VirtualRide", "MountainBikeRide", "GravelRide"]),
): Promise<ReloadResult> {
  if (!user.intervalsEmailEncrypted || !user.intervalsPasswordEncrypted) {
    throw new Error("用户未配置 intervals.icu 登录邮箱/密码，无法执行 Web 重传。");
  }
  if (!user.intervalsApiKeyEncrypted) {
    throw new Error("用户未配置 intervals.icu API Key。");
  }

  const email = decryptSecret(user.intervalsEmailEncrypted);
  const password = decryptSecret(user.intervalsPasswordEncrypted);
  const apiKey = decryptSecret(user.intervalsApiKeyEncrypted);
  const athleteId = user.intervalsAthleteId?.trim() || "0";

  // 1. 用 API 列出近 N 天活动
  const oldest = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19);
  const listRes = await fetch(
    `${ICU_BASE}/api/v1/athlete/${athleteId}/activities?oldest=${oldest}&fields=id,source,start_date_local,name,external_id`,
    {
      headers: {
        Authorization: basicAuthHeader(apiKey),
        Accept: "application/json",
      },
    },
  );

  if (!listRes.ok) {
    throw new Error(`intervals.icu API 列活动失败: ${listRes.status}`);
  }

  const activities = (await listRes.json()) as Array<Record<string, unknown>>;
  const stravaStubs = activities.filter((a) => a.source === "STRAVA");

  if (!stravaStubs.length) {
    return { total: 0, uploaded: 0, skippedNotAnalyzed: 0, skippedType: 0, failed: 0 };
  }

  // 2. Web Session 登录
  const cookie = await webLogin(email, password);

  let uploaded = 0;
  let skippedNotAnalyzed = 0;
  let skippedType = 0;
  let failed = 0;

  for (const stub of stravaStubs) {
    const sid = String(stub.id);

    // 3. 检查活动元数据 (类型 + 是否已分析)
    const metaRes = await fetch(`${ICU_BASE}/api/activity/${sid}`, {
      headers: { Cookie: cookie, Accept: "application/json", "User-Agent": UA, Referer: `${ICU_BASE}/` },
    });

    if (!metaRes.ok) {
      failed++;
      continue;
    }

    const meta = (await metaRes.json()) as Record<string, unknown>;
    const aType = String(meta.type ?? "");

    if (allowedTypes.size > 0 && !allowedTypes.has(aType)) {
      skippedType++;
      continue;
    }

    if (!meta.analyzed) {
      skippedNotAnalyzed++;
      continue;
    }

    // 4. 下载 .fit
    const fitRes = await fetch(`${ICU_BASE}/api/activity/${sid}/fit-file`, {
      headers: { Cookie: cookie, "User-Agent": UA, Referer: `${ICU_BASE}/` },
    });

    if (!fitRes.ok) {
      failed++;
      continue;
    }

    const fitBuf = Buffer.from(await fitRes.arrayBuffer());
    if (fitBuf.length < 1024) {
      failed++;
      continue;
    }

    // 5. 上传 .fit
    const result = await uploadFit(athleteId, apiKey, sid, fitBuf);
    if (result.status === 200 || result.status === 201) {
      uploaded++;
    } else {
      failed++;
    }

    // 限速: 6s 间隔
    await new Promise((r) => setTimeout(r, 6000));
  }

  return {
    total: stravaStubs.length,
    uploaded,
    skippedNotAnalyzed,
    skippedType,
    failed,
  };
}
