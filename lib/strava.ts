import { createId } from "@/lib/storage";
import { decryptSecret } from "@/lib/crypto";
import type { Activity, User } from "@/lib/types";

const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE_URL = "https://www.strava.com/api/v3";
const STRAVA_STREAM_KEYS = ["time", "watts", "heartrate", "cadence", "velocity_smooth", "altitude", "latlng"];

type ExchangeTokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  athlete?: {
    id?: number;
  };
};

type StravaActivityPayload = {
  id: number;
  name?: string;
  start_date?: string;
  start_date_local?: string;
  distance?: number;
  moving_time?: number;
  total_elevation_gain?: number;
  average_speed?: number;
  average_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  suffer_score?: number;
  trainer?: boolean;
  sport_type?: string;
  type?: string;
};

function getEnvValue(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getStravaClientId() {
  return getEnvValue("STRAVA_CLIENT_ID");
}

export function getStravaClientSecret() {
  return getEnvValue("STRAVA_CLIENT_SECRET");
}

export function resolveStravaClientCredentials(user?: Pick<User, "stravaAuthSource" | "stravaPersonalClientId" | "stravaPersonalClientSecretEncrypted">, app?: "platform" | "personal") {
  const target = app ?? user?.stravaAuthSource ?? "platform";
  if (target === "personal") {
    const clientId = user?.stravaPersonalClientId?.trim();
    const clientSecret = user?.stravaPersonalClientSecretEncrypted ? decryptSecret(user.stravaPersonalClientSecretEncrypted) : undefined;
    return {
      app: "personal" as const,
      clientId,
      clientSecret,
    };
  }

  return {
    app: "platform" as const,
    clientId: getStravaClientId(),
    clientSecret: getStravaClientSecret(),
  };
}

export function getDefaultStravaScope() {
  return getEnvValue("STRAVA_SCOPE") ?? "read,activity:read_all";
}

export function getStravaWebhookVerifyToken() {
  return getEnvValue("STRAVA_WEBHOOK_VERIFY_TOKEN");
}

export function getStravaRedirectUri(request: Request) {
  const explicit = getEnvValue("STRAVA_REDIRECT_URI");
  if (explicit) return explicit;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const fallback = new URL(request.url);
  const protocol = forwardedProto || fallback.protocol.replace(/:$/, "");
  const host = forwardedHost || request.headers.get("host") || fallback.host;
  return `${protocol}://${host}/api/auth/strava/callback`;
}

export function buildStravaAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}) {
  const url = new URL(STRAVA_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("approval_prompt", "force");
  url.searchParams.set("scope", input.scope ?? getDefaultStravaScope());
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeStravaCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
}) {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Strava token 交换失败：${response.status} ${text}`);
  }

  return (await response.json()) as ExchangeTokenResponse;
}

export async function refreshStravaToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Strava token 刷新失败：${response.status} ${text}`);
  }

  return (await response.json()) as ExchangeTokenResponse;
}

export async function fetchStravaAthlete(accessToken: string) {
  const response = await fetch(`${STRAVA_API_BASE_URL}/athlete`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Strava athlete 读取失败：${response.status} ${text}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function mapStravaActivity(item: StravaActivityPayload, userId: string): Activity | null {
  if (!item?.id || !item.start_date) return null;
  const now = new Date().toISOString();

  return {
    id: createId("act"),
    userId,
    source: "strava",
    externalActivityId: `strava:${item.id}`,
    name: item.name?.trim() || item.sport_type || item.type || "Strava Activity",
    startTime: new Date(item.start_date).toISOString(),
    distanceKm: item.distance ? Number((item.distance / 1000).toFixed(1)) : 0,
    movingTimeMin: item.moving_time ? Math.round(item.moving_time / 60) : 0,
    elevationM: Math.round(item.total_elevation_gain ?? 0),
    avgSpeedKmh: item.average_speed ? Number((item.average_speed * 3.6).toFixed(1)) : 0,
    avgHr: item.average_heartrate ? Math.round(item.average_heartrate) : undefined,
    avgPower: item.average_watts ? Math.round(item.average_watts) : undefined,
    np: item.weighted_average_watts ? Math.round(item.weighted_average_watts) : undefined,
    ifValue: undefined,
    tss: item.suffer_score ? Math.round(item.suffer_score) : undefined,
    temperatureC: undefined,
    recentCtl: undefined,
    recentAtl: undefined,
    recentForm: undefined,
    rawSummaryJson: item as unknown as Record<string, unknown>,
    rawStreamsJson: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export async function fetchStravaActivities(input: {
  accessToken: string;
  userId: string;
  days?: number;
  perPage?: number;
  after?: string;
}) {
  const perPage = input.perPage ?? 100;
  const after =
    input.after
      ? Math.floor(new Date(input.after).getTime() / 1000)
      : typeof input.days === "number"
        ? Math.floor((Date.now() - 1000 * 60 * 60 * 24 * input.days) / 1000)
        : undefined;
  const results: Activity[] = [];

  for (let page = 1; ; page += 1) {
    const url = new URL(`${STRAVA_API_BASE_URL}/athlete/activities`);
    if (after) {
      url.searchParams.set("after", String(after));
    }
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Strava 活动同步失败：${response.status} ${text}`);
    }

    const payload = (await response.json()) as StravaActivityPayload[];
    if (!payload.length) break;

    results.push(...payload.map((item) => mapStravaActivity(item, input.userId)).filter((item): item is Activity => Boolean(item)));

    if (payload.length < perPage) {
      break;
    }
  }

  return results;
}

function normalizeStravaStreams(payload: unknown) {
  const normalized: Record<string, unknown> = {};
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};

  for (const key of STRAVA_STREAM_KEYS) {
    const stream = record[key];
    if (!stream || typeof stream !== "object") continue;
    const streamRecord = stream as Record<string, unknown>;
    const data = Array.isArray(streamRecord.data) ? streamRecord.data : [];
    normalized[key] = data.slice(0, 7200);
  }

  return normalized;
}

export type StravaSegmentEffortPayload = {
  id: number;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  average_watts?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  pr_rank?: number | null;
  kom_rank?: number | null;
  achievements?: { type_id: number; type: string; rank: number }[];
  device_watts?: boolean;
  segment: {
    id: number;
    name: string;
    distance: number;
    average_grade: number;
    maximum_grade: number;
    elevation_high: number;
    elevation_low: number;
    climb_category: number;
    city?: string;
    state?: string;
    country?: string;
    start_latlng?: [number, number];
    end_latlng?: [number, number];
    total_elevation_gain?: number;
  };
};

export async function fetchStravaActivityDetail(activityId: string, accessToken: string) {
  const normalizedId = activityId.startsWith("strava:") ? activityId.slice("strava:".length) : activityId;
  const url = new URL(`${STRAVA_API_BASE_URL}/activities/${normalizedId}`);
  url.searchParams.set("include_all_efforts", "true");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  updateStravaRateState(response.headers);

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("retry-after") ?? "60", 10);
    throw new StravaRateLimitError(retryAfter);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Strava 活动详情获取失败：${response.status} ${text}`);
  }

  const payload = (await response.json()) as { segment_efforts?: StravaSegmentEffortPayload[] };
  return payload.segment_efforts ?? [];
}

export class StravaRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Strava API 限流，需等待 ${retryAfterSeconds} 秒`);
    this.name = "StravaRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Strava 响应头: X-RateLimit-Limit: "100,1000"  X-RateLimit-Usage: "34,500"
//                                     15min,day                     15min,day
const stravaRateState = { usage15: 0, limit15: 100, lastUpdate: 0 };

export function updateStravaRateState(headers: Headers) {
  const usage = headers.get("x-ratelimit-usage");
  const limit = headers.get("x-ratelimit-limit");
  if (usage) stravaRateState.usage15 = parseInt(usage.split(",")[0], 10) || 0;
  if (limit) stravaRateState.limit15 = parseInt(limit.split(",")[0], 10) || 100;
  stravaRateState.lastUpdate = Date.now();
}

export function getStravaDelayMs(): number {
  const remaining = stravaRateState.limit15 - stravaRateState.usage15;
  if (remaining <= 5) return 60_000;  // 快到限额，等 1 分钟
  if (remaining <= 20) return 10_000; // 余量不多，10s
  if (remaining <= 50) return 3_000;  // 中等余量，3s
  return 1_000;                       // 余量充足，1s
}

export async function fetchStravaActivityStreams(activityId: string, accessToken: string) {
  const normalizedActivityId = activityId.startsWith("strava:") ? activityId.slice("strava:".length) : activityId;
  const url = new URL(`${STRAVA_API_BASE_URL}/activities/${normalizedActivityId}/streams`);
  url.searchParams.set("keys", STRAVA_STREAM_KEYS.join(","));
  url.searchParams.set("key_by_type", "true");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  updateStravaRateState(response.headers);

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("retry-after") ?? "60", 10);
    throw new StravaRateLimitError(retryAfter);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Strava 流数据获取失败：${response.status} ${text}`);
  }

  return normalizeStravaStreams(await response.json());
}
