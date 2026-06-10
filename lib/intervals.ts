import { createId } from "@/lib/storage";
import type { Activity } from "@/lib/types";

const baseUrl = "https://intervals.icu/api/v1";
const streamTypes = ["time", "watts", "heartrate", "cadence", "velocity_smooth", "grade_adjusted_speed", "altitude"];
const fullHistoryStartDate = "2010-01-01";
const recentStreamPrefetchCount = 20;

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function basicAuthHeader(apiKey: string) {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`;
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (typeof value === "number") return value;
  }
  return undefined;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(asRecord(item))) : [];
}

function findRideSportSettings(athlete: Record<string, unknown>) {
  const sportSettings = asRecordArray(athlete.sportSettings);
  const rideTypes = new Set(["Ride", "VirtualRide", "MountainBikeRide", "GravelRide", "TrackRide"]);

  return sportSettings.find((item) => {
    const types = Array.isArray(item.types) ? item.types : [];
    return types.some((type) => typeof type === "string" && rideTypes.has(type));
  });
}

function pickLatestNonNullNumber(entries: Record<string, unknown>[], keys: string[]) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const value = pickNumber(entries[index], keys);
    if (typeof value === "number") return value;
  }
  return undefined;
}

async function fetchJson(path: string, apiKey: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: basicAuthHeader(apiKey),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`intervals.icu 同步失败：${response.status} ${response.statusText}`);
  }

  return (await response.json()) as Record<string, unknown> | Record<string, unknown>[];
}

function normalizeStreamPayload(payload: unknown) {
  const normalized: Record<string, unknown> = {};

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const stream = asRecord(item);
      const type = typeof stream?.type === "string" ? stream.type : undefined;
      if (!type) continue;
      const data = stream && Array.isArray(stream.data) ? stream.data : [];
      normalized[type] = data.slice(0, 7200);
    }
    return normalized;
  }

  const record = asRecord(payload);
  if (!record) return normalized;

  for (const [key, value] of Object.entries(record)) {
    normalized[key] = Array.isArray(value) ? value.slice(0, 7200) : value;
  }

  return normalized;
}

export async function fetchIntervalsProfile(input: {
  athleteId?: string;
  apiKey: string;
}) {
  const athleteId = input.athleteId?.trim() || "0";
  const athlete = (await fetchJson(`/athlete/${athleteId}/`, input.apiKey)) as Record<string, unknown>;
  const rideSportSettings = findRideSportSettings(athlete);

  let wellness: Record<string, unknown>[] | undefined;
  try {
    const newest = formatDate(new Date());
    const oldest = formatDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
    const wellnessPayload = await fetchJson(`/athlete/${athleteId}/wellness?oldest=${oldest}&newest=${newest}`, input.apiKey);
    wellness = Array.isArray(wellnessPayload) ? wellnessPayload.filter((item): item is Record<string, unknown> => Boolean(asRecord(item))) : [];
  } catch {
    wellness = undefined;
  }

  const latestWellnessRestingHr = wellness ? pickLatestNonNullNumber(wellness, ["restingHR", "resting_hr", "resting_heart_rate"]) : undefined;

  return {
    athleteId:
      String(
        athlete.id ??
          athlete.athlete_id ??
          athleteId,
      ) || athleteId,
    weightKg: pickNumber(athlete, ["icu_weight", "weight", "body_weight", "athlete_weight"]),
    ftp: (rideSportSettings ? pickNumber(rideSportSettings, ["ftp", "indoor_ftp"]) : undefined) ?? pickNumber(athlete, ["ftp", "current_ftp"]),
    thresholdHr:
      (rideSportSettings ? pickNumber(rideSportSettings, ["lthr", "threshold_hr", "bike_lthr"]) : undefined) ??
      pickNumber(athlete, ["lthr", "threshold_hr", "bike_lthr"]),
    maxHr:
      (rideSportSettings ? pickNumber(rideSportSettings, ["max_hr", "maximum_hr"]) : undefined) ??
      pickNumber(athlete, ["max_hr", "maximum_hr"]),
    restingHr: pickNumber(athlete, ["icu_resting_hr", "resting_hr", "rest_hr"]) ?? latestWellnessRestingHr,
    rawAthlete: athlete,
    rawWellness: wellness,
  };
}

export async function fetchIntervalsActivities(input: {
  athleteId?: string;
  apiKey: string;
  userId: string;
  days?: number;
  oldest?: string;
}) {
  const newest = new Date();
  const athleteId = input.athleteId?.trim() || "0";
  const oldest =
    input.oldest ||
    (typeof input.days === "number" ? formatDate(new Date(Date.now() - 1000 * 60 * 60 * 24 * input.days)) : fullHistoryStartDate);

  const payload = (await fetchJson(
    `/athlete/${athleteId}/activities?oldest=${oldest}&newest=${formatDate(newest)}`,
    input.apiKey,
  )) as Record<string, unknown>[];
  const baseActivities = payload
    .map((item) => mapIntervalsActivity(item, input.userId))
    .filter((item): item is Activity => Boolean(item));

  const streamPrefetchIds = new Set(baseActivities.slice(0, recentStreamPrefetchCount).map((item) => item.id));
  const activitiesWithStreams = await Promise.all(
    baseActivities.map(async (activity) => {
      if (!streamPrefetchIds.has(activity.id)) {
        return activity;
      }

      const rawStreamsJson = await fetchIntervalsActivityStreams(activity.externalActivityId, input.apiKey);
      return {
        ...activity,
        rawStreamsJson,
      };
    }),
  );

  return activitiesWithStreams;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : undefined;
}

function mapIntervalsActivity(item: Record<string, unknown>, userId: string): Activity | null {
  const externalId = String(item.id ?? item.activity_id ?? "");
  const start = String(item.start_date_local ?? item.start_date ?? item.start_time ?? "");
  if (!externalId || !start) return null;

  const distanceM = asNumber(item.distance);
  const movingTimeS = asNumber(item.moving_time) ?? asNumber(item.elapsed_time);
  const avgSpeedMs = asNumber(item.average_speed);
  const intensityRaw = asNumber(item.icu_intensity) ?? asNumber(item.intensity);
  const tss = asNumber(item.icu_training_load) ?? asNumber(item.training_load) ?? asNumber(item.tss);
  const ctl = asNumber(item.icu_ctl) ?? asNumber(item.ctl);
  const atl = asNumber(item.icu_atl) ?? asNumber(item.atl);
  const form = asNumber(item.icu_ts_b) ?? asNumber(item.form) ?? asNumber(item.tsb);
  const temperature = asNumber(item.average_temp) ?? asNumber(item.temperature);

  const now = new Date().toISOString();
  return {
    id: createId("act"),
    userId,
    source: "intervals.icu",
    externalActivityId: externalId,
    name: String(item.name ?? item.type ?? "Ride"),
    startTime: new Date(start).toISOString(),
    distanceKm: distanceM ? Number((distanceM / 1000).toFixed(1)) : 0,
    movingTimeMin: movingTimeS ? Math.round(movingTimeS / 60) : 0,
    elevationM: Math.round(asNumber(item.total_elevation_gain) ?? asNumber(item.elevation_gain) ?? 0),
    avgSpeedKmh: avgSpeedMs ? Number((avgSpeedMs * 3.6).toFixed(1)) : 0,
    avgHr: Math.round(asNumber(item.average_heartrate) ?? asNumber(item.avg_hr) ?? 0) || undefined,
    avgPower: Math.round(asNumber(item.average_watts) ?? asNumber(item.avg_power) ?? 0) || undefined,
    np: Math.round(asNumber(item.icu_weighted_avg_watts) ?? asNumber(item.weighted_average_watts) ?? 0) || undefined,
    ifValue: intensityRaw ? Number((intensityRaw > 2 ? intensityRaw / 100 : intensityRaw).toFixed(2)) : undefined,
    tss: tss ? Math.round(tss) : undefined,
    temperatureC: temperature ? Math.round(temperature) : undefined,
    recentCtl: ctl ? Math.round(ctl) : undefined,
    recentAtl: atl ? Math.round(atl) : undefined,
    recentForm: form ? Math.round(form) : undefined,
    rawSummaryJson: item,
    rawStreamsJson: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export type IcuSegment = {
  id: number;
  segment_id: number;
  name: string;
  start_index: number;
  end_index: number;
  starred: boolean;
};

export async function fetchIntervalsActivitySegments(activityId: string, apiKey: string): Promise<IcuSegment[]> {
  const response = await fetch(`${baseUrl}/activity/${activityId}/segments`, {
    headers: {
      Authorization: basicAuthHeader(apiKey),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`intervals.icu segments API ${response.status}: ${response.statusText}`);
  }
  return (await response.json()) as IcuSegment[];
}

export async function fetchIntervalsActivityStreams(activityId: string, apiKey: string) {
  const url = `${baseUrl}/activity/${activityId}/streams.json?types=${streamTypes.join(",")}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: basicAuthHeader(apiKey),
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {};
    }

    const payload = (await response.json()) as unknown;
    return normalizeStreamPayload(payload);
  } catch {
    return {};
  }
}
