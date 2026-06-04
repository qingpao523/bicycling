import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Brain, ChevronRight, Droplets, Flame, Gauge, PencilLine, TimerReset } from "lucide-react";

import { ActivityGlanceTabs } from "@/components/activity-glance-tabs";
import { ActivityStreamModal } from "@/components/activity-stream-modal";
import { AiRichText } from "@/components/ai-rich-text";
import { AiReportModal } from "@/components/ai-report-modal";
import { ActivityDetailView } from "@/components/analytics/activity-detail";
import { SingleActivityBackfillButton } from "@/components/analytics/stream-backfill-panel";
import { requireUser } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { buildActivityFeatures } from "@/lib/engine/activity-features";
import { buildRecoveryAdvice } from "@/lib/engine/recovery";
import { buildRideReview } from "@/lib/engine/review";
import { fetchIntervalsActivityStreams } from "@/lib/intervals";
import { fetchStravaActivityStreams, refreshStravaToken, resolveStravaClientCredentials } from "@/lib/strava";
import { formatDateTime, formatDuration } from "@/lib/format";
import { requireAppAvailable, requireSetupReady } from "@/lib/guards";
import {
  getActivity,
  getAiReportByActivityId,
  getAppConfig,
  getFuelLogByActivityId,
  listActivitiesByUser,
  listActivityAliasesByActivityId,
  listAiChatMessagesByActivityId,
  listRidePlansByUser,
  saveUser,
  updateActivityStreams,
} from "@/lib/storage";

const symptoms = ["饿崩", "抽筋", "头晕", "胃不适", "明显口渴"];

function summaryItems(items: string[], empty: string, limit = 4) {
  return items.length ? items.slice(0, limit) : [empty];
}

function compactItems(items: string[], limit = 3) {
  return items.filter(Boolean).slice(0, limit);
}

function fallbackItems(primary: string[], fallback: string[]) {
  return primary.length ? primary : fallback;
}

function normalizeReportLine(line: string) {
  return line.trim().replace(/^[-*•]\s*/, "").replace(/^#+\s*/, "");
}

function isHeading(line: string) {
  const trimmed = line.trim();
  return /^#{1,6}\s+/.test(trimmed) || /^[一二三四五六七八九十]+[、.]/.test(trimmed) || /^\d+[.)．]/.test(trimmed);
}

function extractAiSectionItems(text: string | undefined, keywords: string[], limit = 5) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let collecting = false;
  const items: string[] = [];

  for (const line of lines) {
    const normalized = normalizeReportLine(line);
    const matchesKeyword = keywords.some((keyword) => normalized.includes(keyword));

    if (isHeading(line) && matchesKeyword) {
      collecting = true;
      continue;
    }

    if (collecting && isHeading(line)) {
      break;
    }

    if (!collecting) continue;

    if (normalized) {
      items.push(normalized);
    }

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

function sanitizeConclusionPreview(text: string | undefined) {
  if (!text) return "";

  const hiddenHeadings = new Set(["骑行复盘报告", "先看结论"]);
  return text
    .split(/\r?\n/)
    .filter((line) => !hiddenHeadings.has(normalizeReportLine(line)))
    .join("\n")
    .trim();
}

function metricText(value: number | undefined, suffix: string, digits = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) return "暂无足够数据";
  return `${digits > 0 ? value.toFixed(digits) : value}${suffix}`;
}

function deltaText(value: number | undefined, suffix: string, digits = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) return "暂无近期基线";
  const rendered = digits > 0 ? value.toFixed(digits) : String(value);
  return `${value > 0 ? "+" : ""}${rendered}${suffix}`;
}

function rangeText(from: number | undefined, to: number | undefined, suffix: string, digits = 0) {
  if (typeof from !== "number" || Number.isNaN(from) || typeof to !== "number" || Number.isNaN(to)) {
    return "暂无流数据";
  }
  return `从 ${from.toFixed(digits)}${suffix} 到 ${to.toFixed(digits)}${suffix}`;
}

function compareAgainstAverageText(
  current: number | undefined,
  average: number | undefined,
  suffix: string,
  digits = 0,
) {
  if (typeof current !== "number" || Number.isNaN(current) || typeof average !== "number" || Number.isNaN(average)) {
    return { value: "暂无近期基线" as string, highlight: undefined as string | undefined, highlightTone: undefined as "positive" | "negative" | undefined };
  }

  const currentText = current.toFixed(digits);
  const averageText = average.toFixed(digits);
  const deltaValue = Number((current - average).toFixed(digits));

  return {
    value: `当前 ${currentText}${suffix}，均值 ${averageText}${suffix}`,
    highlight: `差值 ${deltaValue > 0 ? "+" : ""}${deltaValue.toFixed(digits)}${suffix}`,
    highlightTone: deltaValue < 0 ? ("negative" as const) : ("positive" as const),
  };
}

function hasUsableStreamData(rawStreamsJson: Record<string, unknown> | undefined) {
  if (!rawStreamsJson) return false;
  return ["watts", "heartrate", "velocity_smooth"].some((key) => Array.isArray(rawStreamsJson[key]) && rawStreamsJson[key].length > 0);
}

async function resolveStravaAccessToken(user: Awaited<ReturnType<typeof requireUser>>) {
  if (!user.stravaAccessTokenEncrypted) return undefined;

  const accessToken = decryptSecret(user.stravaAccessTokenEncrypted);
  const refreshToken = user.stravaRefreshTokenEncrypted ? decryptSecret(user.stravaRefreshTokenEncrypted) : "";
  const expiresAt = user.stravaTokenExpiresAt ? new Date(user.stravaTokenExpiresAt).getTime() : 0;

  if (!expiresAt || expiresAt > Date.now() + 60_000) {
    return { accessToken, user };
  }

  if (!refreshToken) return undefined;
  const credentials = resolveStravaClientCredentials(user);
  const clientId = credentials.clientId;
  const clientSecret = credentials.clientSecret;
  if (!clientId || !clientSecret) return undefined;

  const refreshed = await refreshStravaToken({
    clientId,
    clientSecret,
    refreshToken,
  });

  const nextUser = await saveUser({
    ...user,
    stravaAthleteId: refreshed.athlete?.id ? String(refreshed.athlete.id) : user.stravaAthleteId,
    stravaAccessTokenEncrypted: encryptSecret(refreshed.access_token),
    stravaRefreshTokenEncrypted: encryptSecret(refreshed.refresh_token),
    stravaTokenExpiresAt: new Date(refreshed.expires_at * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return { accessToken: refreshed.access_token, user: nextUser };
}

export default async function ActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireSetupReady();
  const user = await requireUser();
  await requireAppAvailable();
  const [{ id }, { error, success }] = await Promise.all([params, searchParams]);
  const [config, activity, fuelLog, ridePlans, aiReport, aiChatMessages, recentActivities, activityAliases] = await Promise.all([
    getAppConfig(),
    getActivity(id),
    getFuelLogByActivityId(id),
    listRidePlansByUser(user.id),
    getAiReportByActivityId(id),
    listAiChatMessagesByActivityId(id),
    listActivitiesByUser(user.id),
    listActivityAliasesByActivityId(id),
  ]);

  if (!activity || activity.userId !== user.id) {
    notFound();
  }

  let displayActivity = activity;
  if (!hasUsableStreamData(activity.rawStreamsJson)) {
    try {
      if (activity.source === "intervals.icu" && user.intervalsApiKeyEncrypted && activity.externalActivityId) {
        const apiKey = decryptSecret(user.intervalsApiKeyEncrypted);
        const rawStreamsJson = await fetchIntervalsActivityStreams(activity.externalActivityId, apiKey);
        if (hasUsableStreamData(rawStreamsJson)) {
          displayActivity = await updateActivityStreams(activity.id, rawStreamsJson);
        }
      }

      if (!hasUsableStreamData(displayActivity.rawStreamsJson)) {
        const stravaAlias =
          activity.source === "strava"
            ? { externalActivityId: activity.externalActivityId }
            : activityAliases.find((item) => item.source === "strava");
        if (stravaAlias) {
          const auth = await resolveStravaAccessToken(user);
          if (auth?.accessToken) {
            const rawStreamsJson = await fetchStravaActivityStreams(stravaAlias.externalActivityId, auth.accessToken);
            if (hasUsableStreamData(rawStreamsJson)) {
              displayActivity = await updateActivityStreams(activity.id, rawStreamsJson);
            }
          }
        }
      }
    } catch {}
  }

  const referenceRidePlan = ridePlans[0];
  const review = buildRideReview({ activity: displayActivity, fuelLog });
  const recovery = buildRecoveryAdvice({ activity: displayActivity, fuelLog, user, referenceRidePlan });
  const features = buildActivityFeatures({ activity: displayActivity, user, fuelLog, recentActivities });

  if (!config.featureRecovery && !config.featureAiReview) {
    redirect("/");
  }

  const highlightItems = summaryItems(review.highlights, "这次骑行还没有足够明显的亮点标签。");
  const issueItems = summaryItems([...review.problems, ...review.causes], "目前没有明确风险信号。");
  const nextActionItems = summaryItems(
    [recovery.nextDay, ...recovery.warnings, ...review.nextAdvice],
    "先补充骑后记录，系统才会给出更具体的恢复和训练建议。",
  );
  const symptomValues = new Set(fuelLog?.symptoms ?? []);
  const aiHighlights = extractAiSectionItems(aiReport?.reviewText, ["亮点", "做得好", "表现"], 4);
  const aiRisks = extractAiSectionItems(aiReport?.reviewText, ["风险", "问题", "原因"], 4);
  const aiRecovery = extractAiSectionItems(aiReport?.reviewText, ["恢复", "恢复建议", "明天"], 4);
  const hasPowerData = displayActivity.avgPower != null || displayActivity.np != null || displayActivity.ifValue != null;
  const hasHrData = displayActivity.avgHr != null;
  const hasStreamData = Boolean(features.stream_analysis);
  const dataWarnings = compactItems(
    [
      !hasPowerData ? "缺少功率数据，IF / NP / 功率对比已降级为更保守判断。" : "",
      !hasHrData ? "缺少心率数据，恢复压力和疲劳判断准确度下降。" : "",
      !hasStreamData ? "缺少流数据，时序分析和分段摘要暂不可用。" : "",
    ],
    3,
  );
  const coreConclusion = aiReport?.reviewText ? sanitizeConclusionPreview(aiReport.reviewText) : review.oneLine;
  const conclusionReasons = compactItems(
    aiRisks.length
      ? aiRisks
      : [
          displayActivity.tss ? `本次 TSS ${displayActivity.tss}，负荷不低。` : "",
          displayActivity.elevationM ? `累计爬升 ${displayActivity.elevationM} m，对恢复成本有直接影响。` : "",
          recovery.recoveryWindow ? `当前建议恢复窗口 ${recovery.recoveryWindow}。` : "",
        ],
    3,
  );
  const conclusionTags = compactItems(
    [
      review.rideType,
      `${recovery.level}恢复压力`,
      recovery.recoveryWindow,
      fuelLog ? "已记录补给" : "待补给记录",
      features.load_context.current_load_bucket ? `负荷:${features.load_context.current_load_bucket}` : "",
    ],
    5,
  );
  const defaultDoubleGelCount = fuelLog?.doubleGelCountActual ?? fuelLog?.gelCountActual ?? 0;
  const defaultCaffeineGelCount = fuelLog?.caffeineGelCountActual ?? 0;
  const defaultSaltCapsuleCount = fuelLog?.saltCapsuleCountActual ?? 0;
  const estimatedCarbs = defaultDoubleGelCount * 45 + defaultCaffeineGelCount * 30;
  const rideCalories =
    typeof features.energy_profile.calories === "number"
      ? Math.round(features.energy_profile.calories)
        : typeof displayActivity.rawSummaryJson?.calories === "number"
        ? Math.round(displayActivity.rawSummaryJson.calories as number)
        : undefined;
  const quickStatusItems = [
    {
      icon: Flame,
      label: "恢复等级",
      value: `${recovery.level}负荷，优先恢复`,
    },
    {
      icon: TimerReset,
      label: "恢复窗口",
      value: `建议预留 ${recovery.recoveryWindow}`,
    },
    {
      icon: Droplets,
      label: "补给状态",
      value: fuelLog
        ? recovery.fuelReview.length
          ? recovery.fuelReview[0]
          : "已记录补给，可继续修正建议"
        : "待补充骑后补给记录",
    },
    {
      icon: Gauge,
      label: "次日建议",
      value: recovery.nextDay,
    },
  ];
  const pacingGlanceItems = compactItems(
    [
      `爬升密度：${metricText(features.pacing_profile.climbing_density_m_per_km, " m/km", 1)}`,
      `爬升速率：${metricText(features.pacing_profile.ascent_rate_m_per_h, " m/h", 0)}`,
      `停顿比例：${typeof features.pacing_profile.stoppage_ratio === "number" ? `${Math.round(features.pacing_profile.stoppage_ratio * 100)}%` : "暂无足够数据"}`,
      `平均踏频：${metricText(features.pacing_profile.average_cadence, " rpm", 0)}`,
    ],
    4,
  );
  const fatigueGlanceItems = compactItems(
    [
      rangeText(features.stream_analysis?.first_half.avg_power, features.stream_analysis?.second_half.avg_power, " W", 0),
      rangeText(features.stream_analysis?.first_half.avg_speed_kmh, features.stream_analysis?.second_half.avg_speed_kmh, " km/h", 1),
      rangeText(features.stream_analysis?.first_half.avg_hr, features.stream_analysis?.second_half.avg_hr, " bpm", 0),
      `主观疲劳：${fuelLog ? `${fuelLog.fatigueScore}/10，腿部 ${fuelLog.legFatigueScore}/10` : "还没填写骑后主观反馈"}`,
    ],
    4,
  );
  const compareGlanceItems = [
    compareAgainstAverageText(displayActivity.movingTimeMin, features.load_context.recent_avg_duration_min, " min", 0),
    compareAgainstAverageText(displayActivity.elevationM, features.load_context.recent_avg_elevation_m, " m", 0),
    compareAgainstAverageText(displayActivity.tss, features.load_context.recent_avg_tss, "", 0),
    compareAgainstAverageText(displayActivity.ifValue, features.load_context.recent_avg_if, "", 2),
  ];
  const glanceTabs = [
    {
      key: "recovery" as const,
      label: "恢复",
      items: quickStatusItems.map((item) => ({ label: item.label, value: item.value })),
    },
    {
      key: "pacing" as const,
      label: "配速",
      items: [
        { label: "路线特征", value: pacingGlanceItems[0] ?? "暂无足够数据" },
        { label: "爬升效率", value: pacingGlanceItems[1] ?? "暂无足够数据" },
        { label: "停顿情况", value: pacingGlanceItems[2] ?? "暂无足够数据" },
        { label: "踩踏节奏", value: pacingGlanceItems[3] ?? "暂无足够数据" },
      ],
    },
    {
      key: "fatigue" as const,
      label: "疲劳",
      items: [
        {
          label: "功率走势",
          value: fatigueGlanceItems[0] ?? "暂无流数据",
          action: fatigueGlanceItems[0] ? undefined : { kind: "backfill" as const, activityId: displayActivity.id },
        },
        {
          label: "速度走势",
          value: fatigueGlanceItems[1] ?? "暂无流数据",
          action: fatigueGlanceItems[1] ? undefined : { kind: "backfill" as const, activityId: displayActivity.id },
        },
        {
          label: "心率漂移",
          value: fatigueGlanceItems[2] ?? "暂无流数据",
          action: fatigueGlanceItems[2] ? undefined : { kind: "backfill" as const, activityId: displayActivity.id },
        },
        {
          label: "主观反馈",
          value: fatigueGlanceItems[3] ?? "还没填写骑后主观反馈",
          action: fuelLog ? undefined : { kind: "fill_fuel" as const },
        },
      ],
    },
    {
      key: "compare" as const,
      label: "对比",
      items: [
        {
          label: "时长对比",
          badge: "近7次",
          value: compareGlanceItems[0]?.value ?? "暂无近期基线",
          highlight: compareGlanceItems[0]?.highlight,
          highlightTone: compareGlanceItems[0]?.highlightTone,
        },
        {
          label: "爬升对比",
          badge: "近7次",
          value: compareGlanceItems[1]?.value ?? "暂无近期基线",
          highlight: compareGlanceItems[1]?.highlight,
          highlightTone: compareGlanceItems[1]?.highlightTone,
        },
        {
          label: "负荷对比",
          badge: "近7次",
          value: compareGlanceItems[2]?.value ?? "暂无近期基线",
          highlight: compareGlanceItems[2]?.highlight,
          highlightTone: compareGlanceItems[2]?.highlightTone,
        },
        {
          label: "强度对比",
          badge: "近7次",
          value: compareGlanceItems[3]?.value ?? "暂无近期基线",
          highlight: compareGlanceItems[3]?.highlight,
          highlightTone: compareGlanceItems[3]?.highlightTone,
        },
      ],
    },
  ];
  const actionCards = [
    { title: "今晚怎么恢复", items: compactItems(recovery.nutrition, 3) },
    { title: "补液 / 电解质", items: compactItems(recovery.hydration, 3) },
    {
      title: "补给复盘",
      items: compactItems(
        recovery.fuelReview.length ? recovery.fuelReview : ["当前还没有足够的实际补给数据，建议先补录骑后补给。"],
        3,
      ),
    },
    { title: "次日训练建议", items: compactItems([recovery.nextDay, ...review.nextAdvice], 3) },
  ];
  const aiInsightCards = [
    {
      title: "AI 深度洞察",
      items: fallbackItems(
        extractAiSectionItems(aiReport?.reviewText, ["洞察", "判断", "结论", "骑行概述"], 5),
        summaryItems(
          [
            `负荷分层：${features.load_context.current_load_bucket}`,
            `爬升密度：${features.pacing_profile.climbing_density_m_per_km ?? "--"} m/km`,
            `工作率：${features.energy_profile.work_rate_kj_per_min ?? "--"} kJ/min`,
          ],
          "等待 AI 报告生成。",
          5,
        ),
      ),
    },
    {
      title: "AI 对比判断",
      items: fallbackItems(
        extractAiSectionItems(aiReport?.reviewText, ["对比", "相较", "近期", "训练背景"], 5),
        summaryItems(
          [
            `时长差：${features.load_context.current_vs_recent.duration_delta_min ?? "--"} min`,
            `爬升差：${features.load_context.current_vs_recent.elevation_delta_m ?? "--"} m`,
            `TSS 差：${features.load_context.current_vs_recent.tss_delta ?? "--"}`,
          ],
          "等待 AI 报告生成。",
          5,
        ),
      ),
    },
    {
      title: "AI 疲劳信号",
      items: fallbackItems(
        extractAiSectionItems(aiReport?.reviewText, ["疲劳", "后半程", "漂移", "掉功率"], 5),
        summaryItems(
          features.stream_analysis
            ? [
                `功率衰减：${features.stream_analysis.fatigue_signals.power_fade_pct ?? "--"} %`,
                `速度衰减：${features.stream_analysis.fatigue_signals.speed_fade_pct ?? "--"} %`,
                `心率漂移：${features.stream_analysis.fatigue_signals.heart_rate_drift_pct ?? "--"} %`,
              ]
            : [],
          "当前活动未拿到可用流数据。",
          5,
        ),
      ),
    },
    {
      title: "AI 下一步重点",
      items: fallbackItems(
        extractAiSectionItems(aiReport?.reviewText, ["建议", "下一步", "下次"], 5),
        summaryItems([...review.nextAdvice, recovery.nextDay], "等待 AI 报告生成。", 5),
      ),
    },
  ];

  return (
    <main className="activity-page">
      <section className="activity-shell">
        <div className="activity-main">
          <section className="activity-top-grid">
            <section className="activity-hero panel">
              <div className="activity-hero-copy">
                <div className="row activity-hero-head">
                  <div>
                    <div className="eyebrow">单次骑行分析</div>
                    <h1>{displayActivity.name}</h1>
                  </div>
                  <span className="pill">{review.rideType}</span>
                </div>
                {error ? <p className="error-banner">{decodeURIComponent(error)}</p> : null}
                {success ? <p className="success-banner">{decodeURIComponent(success)}</p> : null}
                <div className="activity-meta-inline">
                  <span>{formatDateTime(displayActivity.startTime)}</span>
                  <span>{displayActivity.name.length > 20 ? "已折叠长标题显示" : "活动元数据可继续展开"}</span>
                </div>
              </div>

              <div className="activity-metric-grid">
                <div className="summary-card activity-metric-card">
                  <div className="eyebrow">时间</div>
                  <div className="summary-value activity-metric-time-value">{formatDuration(displayActivity.movingTimeMin)}</div>
                  <p className="muted">{formatDateTime(displayActivity.startTime)}</p>
                </div>
                <div className="summary-card activity-metric-card">
                  <div className="eyebrow">距离 / 爬升</div>
                  <div className="summary-value">{displayActivity.distanceKm} km</div>
                  <p className="muted">{displayActivity.elevationM} m 爬升</p>
                </div>
                <div className="summary-card activity-metric-card">
                  <div className="eyebrow">{hasPowerData ? "强度" : "强度判断"}</div>
                  <div className="summary-value">{hasPowerData ? `IF ${displayActivity.ifValue ?? "--"}` : "保守判断"}</div>
                  <p className="muted">{hasPowerData ? `TSS ${displayActivity.tss ?? "--"}` : "缺少功率，改用时长与心率评估"}</p>
                </div>
                <div className="summary-card activity-metric-card">
                  <div className="eyebrow">{hasPowerData ? "心率 / 功率" : "心率概览"}</div>
                  <div className="summary-value">
                    {hasHrData ? `${displayActivity.avgHr ?? "--"} bpm` : hasPowerData ? `${displayActivity.np ?? displayActivity.avgPower ?? "--"} W` : "--"}
                  </div>
                  <p className="muted">
                    {hasPowerData
                      ? `NP ${displayActivity.np ?? "--"}W / 均功率 ${typeof displayActivity.avgPower === "number" ? `${displayActivity.avgPower}W` : "--"}`
                      : "缺少功率数据"}
                  </p>
                </div>
                <div className="summary-card activity-metric-card">
                  <div className="eyebrow">匀速</div>
                  <div className="summary-value activity-metric-inline-value">
                    {displayActivity.avgSpeedKmh ? (
                      <>
                        <span>{displayActivity.avgSpeedKmh}</span>
                        <span className="activity-metric-unit">km/h</span>
                      </>
                    ) : (
                      "--"
                    )}
                  </div>
                  <p className="muted">活动移动时间</p>
                </div>
                <div className="summary-card activity-metric-card">
                  <div className="eyebrow">热量</div>
                  <div className="summary-value">{typeof rideCalories === "number" ? `${rideCalories} kcal` : "--"}</div>
                  <p className="muted">活动预估热量</p>
                </div>
              </div>
            </section>

            <section className="panel activity-side-card activity-status-card">
              <div className="section-title">
                <h2>一眼结论</h2>
                <span className="muted">先看状态，再决定是否深挖</span>
              </div>
              <ActivityGlanceTabs tabs={glanceTabs} />
              <ActivityStreamModal rawStreamsJson={displayActivity.rawStreamsJson} />
            </section>

            <section className="activity-side-stack">
              <div id="fuel-log" className="panel activity-side-card activity-fuel-card">
                <div className="section-title">
                  <h2>骑中补给与疲劳记录</h2>
                  <span className={`status-dot ${fuelLog ? "ok" : "warn"}`}>{fuelLog ? "已记录" : "待填写"}</span>
                </div>
                <p className="muted">补给记录会直接修正恢复判断、疲劳信号和次日建议。</p>
                {!fuelLog ? (
                  <div className="activity-log-callout">
                    <span className="pill">待录入补给</span>
                    <p className="muted">当前还没有骑中补给记录，建议补录后再看恢复判断和次日建议。</p>
                  </div>
                ) : null}

                <form action={`/api/activities/${activity.id}/fuel-log`} method="post" className="activity-fuel-form">
                  <div className="activity-fuel-grid">
                    <label>
                      双效胶数量
                      <input type="number" name="doubleGelCountActual" min="0" defaultValue={defaultDoubleGelCount} required />
                    </label>
                    <label>
                      咖啡胶数量
                      <input type="number" name="caffeineGelCountActual" min="0" defaultValue={defaultCaffeineGelCount} required />
                    </label>
                    <label>
                      其他备注
                      <input
                        type="text"
                        name="carbOtherDesc"
                        defaultValue={fuelLog?.carbOtherDesc ?? ""}
                        placeholder="如：吃了半根能量棒，后程胃口差"
                      />
                    </label>
                    <label>
                      盐丸数量
                      <input type="number" name="saltCapsuleCountActual" min="0" defaultValue={defaultSaltCapsuleCount} />
                    </label>
                    <div className="input-note activity-fuel-note">
                      当前约 {estimatedCarbs} g 碳水。
                      双效胶按 45 g / 支，咖啡胶按 30 g / 支估算。
                    </div>
                    <label>
                      电解质
                      <select name="electrolyteUsed" defaultValue={fuelLog?.electrolyteUsed ? "true" : "false"}>
                        <option value="false">未补</option>
                        <option value="true">已补</option>
                      </select>
                    </label>
                    <label>
                      饮水量（ml）
                      <input type="number" name="waterMlActual" min="0" step="50" defaultValue={fuelLog?.waterMlActual ?? 0} required />
                    </label>
                    <label>
                      主观疲劳（1-10）
                      <input type="number" name="fatigueScore" min="1" max="10" defaultValue={fuelLog?.fatigueScore ?? 6} required />
                    </label>
                    <label>
                      腿部疲劳（1-10）
                      <input type="number" name="legFatigueScore" min="1" max="10" defaultValue={fuelLog?.legFatigueScore ?? 6} required />
                    </label>
                  </div>

                  <div className="activity-form-group activity-form-group-tight">
                    <h3>身体反应</h3>
                    <div className="activity-chip-group">
                      {symptoms.map((item) => (
                        <label key={item} className="activity-chip-option">
                          <input type="checkbox" name="symptoms" value={item} defaultChecked={symptomValues.has(item)} />
                          <span>{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button type="submit" className="primary activity-save-button">
                    <PencilLine size={16} />
                    保存并刷新建议
                  </button>
                </form>
              </div>
            </section>
          </section>

          {config.featureAiReview ? (
            <section className="panel activity-core-card activity-core-card-wide" id="activity-report">
              <div className="section-title">
                <h2>核心结论与完整报告</h2>
                <div className="activity-core-head-actions">
                  <span className={`status-dot ${aiReport?.reviewText ? "ok" : "idle"}`}>{aiReport?.reviewText ? "已生成" : "待生成"}</span>
                  <AiReportModal
                    activityId={activity.id}
                    activityTitle={displayActivity.name}
                    reportText={aiReport?.reviewText}
                    initialOpen={false}
                    initialMessages={aiChatMessages}
                    successMessage={success}
                    errorMessage={error}
                    compact
                  />
                </div>
              </div>
              <div className="activity-core-summary">
                <div className="activity-summary-head">
                  <div className="summary-icon">
                    <Brain size={18} />
                  </div>
                  <h3>一句话结论</h3>
                </div>
                {aiReport?.reviewText ? (
                  <div className="activity-core-rich-preview">
                    <AiRichText text={coreConclusion} />
                  </div>
                ) : (
                  <p>{coreConclusion}</p>
                )}
              </div>
              {!aiReport?.reviewText ? (
                <div className="activity-core-empty">
                  <p className="muted">当前还没有 AI 报告。先生成一次报告，核心结论会按这次骑行和补给记录重新总结。</p>
                  <form action={`/api/activities/${activity.id}/ai-report`} method="post" className="activity-inline-form">
                    <button type="submit" className="primary">
                      生成 AI 报告
                    </button>
                  </form>
                </div>
              ) : null}
              <div className="activity-tag-row">
                {conclusionTags.map((tag) => (
                  <span key={tag} className="activity-tag">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="activity-core-reasons">
                <div className="activity-summary-head">
                  <div className="summary-icon">
                    <ChevronRight size={18} />
                  </div>
                  <h3>关键原因</h3>
                </div>
                <ul className="list">
                  {conclusionReasons.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <details className="activity-core-details">
                <summary>展开完整分析</summary>
                <div className="activity-analysis-grid activity-core-detail-grid">
                  <div className="list-card">
                    <h3>本次表现亮点</h3>
                    <ul className="list">
                      {fallbackItems(aiHighlights, highlightItems).slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="list-card">
                    <h3>主要风险</h3>
                    <ul className="list">
                      {fallbackItems(aiRisks, issueItems).slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="list-card">
                    <h3>恢复建议</h3>
                    <ul className="list">
                      {fallbackItems(aiRecovery, nextActionItems).slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            </section>
          ) : null}

          {config.featureRecovery ? (
            <section className="activity-recovery-section panel">
              <div className="section-title">
                <h2>恢复与行动建议</h2>
                <span className="muted">看完就知道今晚怎么恢复、明天怎么练</span>
              </div>
              <p>{recovery.summary}</p>
              <div className="activity-action-grid">
                {actionCards.map((card) => (
                  <div key={card.title} className="list-card">
                    <h3>{card.title}</h3>
                    <ul className="list">
                      {card.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="activity-analysis-section panel">
            <div className="section-title">
              <h2>深度分析</h2>
              <span className="muted">默认先看 AI 深度判断，底层分析按需展开</span>
            </div>

            <div className="activity-analysis-stack">
              <details className="activity-analysis-group" open>
                <summary>AI 深度分析</summary>
                <div className="activity-analysis-grid">
                  {aiInsightCards.map((card) => (
                    <div key={card.title} className="list-card">
                      <h3>{card.title}</h3>
                      <ul className="list">
                        {card.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>

              <details className="activity-analysis-group">
                <summary>底层数据</summary>
                <div className="activity-analysis-grid">
                  <div className="list-card">
                    <h3>原始特征</h3>
                    <ul className="list">
                      <li>负荷分层：{features.load_context.current_load_bucket}</li>
                      <li>爬升密度：{features.pacing_profile.climbing_density_m_per_km ?? "--"} m/km</li>
                      <li>爬升效率：{features.pacing_profile.ascent_rate_m_per_h ?? "--"} m/h</li>
                      <li>停留占比：{features.pacing_profile.stoppage_ratio ?? "--"}</li>
                      <li>速度/功率比：{features.pacing_profile.speed_to_power_ratio ?? "--"}</li>
                      <li>工作率：{features.energy_profile.work_rate_kj_per_min ?? "--"} kJ/min</li>
                    </ul>
                  </div>
                  <div className="list-card">
                    <h3>近期对比</h3>
                    <ul className="list">
                      <li>时长差：{features.load_context.current_vs_recent.duration_delta_min ?? "--"} min</li>
                      <li>爬升差：{features.load_context.current_vs_recent.elevation_delta_m ?? "--"} m</li>
                      <li>TSS 差：{features.load_context.current_vs_recent.tss_delta ?? "--"}</li>
                      {hasPowerData ? <li>IF 差：{features.load_context.current_vs_recent.if_delta ?? "--"}</li> : null}
                      {hasPowerData ? <li>平均功率占 FTP：{features.power_profile?.avg_power_pct_ftp ?? "--"}</li> : null}
                      {hasPowerData ? <li>NP 占 FTP：{features.power_profile?.normalized_power_pct_ftp ?? "--"}</li> : null}
                      {!hasPowerData ? <li>缺少功率数据，功率对比已隐藏。</li> : null}
                    </ul>
                  </div>
                  <div className="list-card">
                    <h3>时序分析</h3>
                    {hasStreamData ? (
                      <ul className="list">
                        <li>前半程平均功率：{features.stream_analysis?.first_half.avg_power ?? "--"} W</li>
                        <li>后半程平均功率：{features.stream_analysis?.second_half.avg_power ?? "--"} W</li>
                        <li>前半程平均心率：{features.stream_analysis?.first_half.avg_hr ?? "--"} bpm</li>
                        <li>后半程平均心率：{features.stream_analysis?.second_half.avg_hr ?? "--"} bpm</li>
                        <li>功率衰减：{features.stream_analysis?.fatigue_signals.power_fade_pct ?? "--"} %</li>
                        <li>心率漂移：{features.stream_analysis?.fatigue_signals.heart_rate_drift_pct ?? "--"} %</li>
                      </ul>
                    ) : (
                      <p className="muted">当前缺少流数据，暂时无法生成时序分析。</p>
                    )}
                  </div>
                  <div className="list-card">
                    <h3>分段摘要</h3>
                    {features.stream_analysis?.segment_summaries?.length ? (
                      <ul className="list">
                        {features.stream_analysis.segment_summaries.slice(0, 5).map((segment) => (
                          <li key={segment.segment}>
                            第 {segment.segment} 段（{segment.minute_range} 分钟）:
                            功率 {segment.avg_power ?? "--"}W / 心率 {segment.avg_hr ?? "--"} / 速度 {segment.avg_speed_kmh ?? "--"} km/h
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">当前暂无可展示分段。</p>
                    )}
                  </div>
                </div>
              </details>

              <details className="activity-analysis-group">
                <summary>训练背景</summary>
                <div className="activity-analysis-grid">
                  <div className="list-card">
                    <h3>近期训练背景</h3>
                    <ul className="list">
                      <li>CTL / ATL / Form：{activity.recentCtl ?? "--"} / {activity.recentAtl ?? "--"} / {activity.recentForm ?? "--"}</li>
                      <li>心率数据：{hasHrData ? "可用" : "缺失，恢复判断精度下降"}</li>
                      <li>功率数据：{hasPowerData ? "可用" : "缺失，强度判断将更保守"}</li>
                      <li>流数据：{hasStreamData ? "可用" : "缺失，无法做前后半程对比"}</li>
                    </ul>
                  </div>
                  <div className="list-card">
                    <h3>当前活动位置</h3>
                    <ul className="list">
                      <li>负荷层级：{features.load_context.current_load_bucket}</li>
                      <li>近期时长差：{features.load_context.current_vs_recent.duration_delta_min ?? "--"} min</li>
                      <li>近期爬升差：{features.load_context.current_vs_recent.elevation_delta_m ?? "--"} m</li>
                      <li>近期 TSS 差：{features.load_context.current_vs_recent.tss_delta ?? "--"}</li>
                    </ul>
                  </div>
                </div>
              </details>
            </div>
          </section>
        </div>
      </section>
      {/* Enhanced stream analysis */}
      {(() => {
        const streams = displayActivity.rawStreamsJson as Record<string, unknown> | null;
        const hasStreams = !!streams && Array.isArray((streams as any).watts) && ((streams as any).watts as unknown[]).length > 0;
        const ftp = user.ftp ?? user.syncedFtp ?? null;
        const maxHr = user.maxHr ?? user.syncedMaxHr ?? null;

        if (!hasStreams) {
          // Show backfill button to pull stream data on demand
          return (
            <section className="panel">
              <div className="section-title">
                <h2>深度数据分析</h2>
                <span className="muted">暂无流数据</span>
              </div>
              <div style={{ padding: "20px 0", color: "var(--muted)", fontSize: "0.9rem" }}>
                <p style={{ margin: "0 0 12px" }}>
                  此活动尚未拉取流数据（功率/心率/踏频时间序列）。点击下方按钮从 {displayActivity.source} 补拉。
                </p>
                <SingleActivityBackfillButton activityId={displayActivity.id} />
              </div>
            </section>
          );
        }

        const streamData = {
          watts: (streams as any).watts as number[],
          heartrate: Array.isArray((streams as any).heartrate) ? ((streams as any).heartrate as number[]) : [],
          cadence: Array.isArray((streams as any).cadence) ? ((streams as any).cadence as number[]) : [],
          altitude: Array.isArray((streams as any).altitude) ? ((streams as any).altitude as number[]) : [],
          time: Array.isArray((streams as any).time) ? ((streams as any).time as number[]) : [],
          velocity: Array.isArray((streams as any).velocity_smooth) ? ((streams as any).velocity_smooth as number[]) : [],
        };
        return (
          <section className="panel">
            <div className="section-title">
              <h2>深度数据分析</h2>
              <span className="muted">基于流数据的功率/心率/踏频时间序列</span>
            </div>
            <ActivityDetailView streams={streamData} ftp={ftp} maxHr={maxHr} />
          </section>
        );
      })()}

      <div className="activity-footer-actions">
        <Link href="/dashboard" className="button">
          返回仪表盘
        </Link>
        <Link href="/activities" className="button">
          返回训练历史
        </Link>
      </div>
    </main>
  );
}
