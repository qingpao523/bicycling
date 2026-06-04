import { notFound, redirect } from "next/navigation";
import { Brain, ChevronRight } from "lucide-react";

import { ActivityGlanceTabs } from "@/components/activity-glance-tabs";
import { ActivityStreamModal } from "@/components/activity-stream-modal";
import { AiRichText } from "@/components/ai-rich-text";
import { AiReportModal } from "@/components/ai-report-modal";
import { ActivityDetailView } from "@/components/analytics/activity-detail";
import { SingleActivityBackfillButton } from "@/components/analytics/stream-backfill-panel";
import { ActivityHero } from "@/components/activity-detail/hero";
import { ActivityStateCard } from "@/components/activity-detail/state-card";
import { ActivityFuelRecoverySection } from "@/components/activity-detail/fuel-recovery-section";
import { ActivityFuelLogForm } from "@/components/activity-detail/fuel-log-form";
import { ActivityRecoveryCards } from "@/components/activity-detail/recovery-cards";
import { ActivityDeepDataSection } from "@/components/activity-detail/deep-data-section";
import { ActivityGeekZone } from "@/components/activity-detail/geek-zone";
import { ActivityFooterActions } from "@/components/activity-detail/footer-actions";
import { buildActivityGlanceTabs } from "@/lib/activity-detail-glance";
import { requireUser } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { buildActivityFeatures } from "@/lib/engine/activity-features";
import { buildRecoveryAdvice } from "@/lib/engine/recovery";
import { buildRideReview } from "@/lib/engine/review";
import { evaluateActivityIntensity } from "@/lib/engine/cycling-levels";
import { fetchIntervalsActivityStreams } from "@/lib/intervals";
import { fetchStravaActivityStreams, refreshStravaToken, resolveStravaClientCredentials } from "@/lib/strava";
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

  const weightKg = user.weightKg ?? user.syncedWeightKg ?? undefined;
  const intensityBadge = evaluateActivityIntensity(displayActivity, weightKg);

  const highlightItems = summaryItems(review.highlights, "这次骑行还没有足够明显的亮点标签。");
  const issueItems = summaryItems([...review.problems, ...review.causes], "目前没有明确风险信号。");
  const nextActionItems = summaryItems(
    [recovery.nextDay, ...recovery.warnings, ...review.nextAdvice],
    "先补充骑后记录，系统才会给出更具体的恢复和训练建议。",
  );
  const aiHighlights = extractAiSectionItems(aiReport?.reviewText, ["亮点", "做得好", "表现"], 4);
  const aiRisks = extractAiSectionItems(aiReport?.reviewText, ["风险", "问题", "原因"], 4);
  const aiRecovery = extractAiSectionItems(aiReport?.reviewText, ["恢复", "恢复建议", "明天"], 4);
  const hasPowerData = displayActivity.avgPower != null || displayActivity.np != null || displayActivity.ifValue != null;
  const hasHrData = displayActivity.avgHr != null;
  const hasStreamData = Boolean(features.stream_analysis);
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
  const rideCalories =
    typeof features.energy_profile.calories === "number"
      ? Math.round(features.energy_profile.calories)
        : typeof displayActivity.rawSummaryJson?.calories === "number"
        ? Math.round(displayActivity.rawSummaryJson.calories as number)
        : undefined;

  const glanceTabs = buildActivityGlanceTabs({
    activity: displayActivity,
    fuelLog,
    recovery,
    features,
  });

  // ───── §E stream chart (用于 ActivityDeepDataSection) ─────
  const streamsRaw = displayActivity.rawStreamsJson as Record<string, unknown> | null;
  const hasStreamsForChart =
    !!streamsRaw && Array.isArray((streamsRaw as any).watts) && ((streamsRaw as any).watts as unknown[]).length > 0;
  const ftp = user.ftp ?? user.syncedFtp ?? null;
  const maxHr = user.maxHr ?? user.syncedMaxHr ?? null;
  const streamData = hasStreamsForChart
    ? {
        watts: (streamsRaw as any).watts as number[],
        heartrate: Array.isArray((streamsRaw as any).heartrate) ? ((streamsRaw as any).heartrate as number[]) : [],
        cadence: Array.isArray((streamsRaw as any).cadence) ? ((streamsRaw as any).cadence as number[]) : [],
        altitude: Array.isArray((streamsRaw as any).altitude) ? ((streamsRaw as any).altitude as number[]) : [],
        time: Array.isArray((streamsRaw as any).time) ? ((streamsRaw as any).time as number[]) : [],
        velocity: Array.isArray((streamsRaw as any).velocity_smooth)
          ? ((streamsRaw as any).velocity_smooth as number[])
          : [],
      }
    : null;

  return (
    <main className="analytics-page" style={{ display: "grid", gap: 20, padding: "0 24px 40px", maxWidth: 1200, margin: "0 auto" }}>
      {/* §A Hero */}
      <ActivityHero
        activity={{
          id: displayActivity.id,
          name: displayActivity.name,
          startTime: displayActivity.startTime,
          rideType: review.rideType,
        }}
        metrics={{
          durationMin: displayActivity.movingTimeMin,
          distanceKm: displayActivity.distanceKm,
          elevationM: displayActivity.elevationM,
          tss: displayActivity.tss,
          ifValue: displayActivity.ifValue,
          avgSpeedKmh: displayActivity.avgSpeedKmh,
          avgPower: displayActivity.avgPower,
          np: displayActivity.np,
          avgHr: displayActivity.avgHr,
          calories: rideCalories,
        }}
        badge={intensityBadge}
        error={error}
        success={success}
      />

      {/* §B 状态 + 风险 */}
      <ActivityStateCard
        tss={displayActivity.tss}
        recentAvgTss={features.load_context.recent_avg_tss}
        ifValue={displayActivity.ifValue}
        movingTimeMin={displayActivity.movingTimeMin}
      />

      {/* ★ 一眼结论 tabs (保留, 配合 GlanceTabs 组件) */}
      <section className="analytics-card" style={{ display: "grid", gap: 12 }}>
        <div className="analytics-card-header" style={{ marginBottom: 0 }}>
          <h2>一眼结论</h2>
          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>先看状态，再决定是否深挖</span>
        </div>
        <ActivityGlanceTabs tabs={glanceTabs} />
      </section>

      {/* §C ★ 核心结论与完整报告 — 整段保留, 不动 */}
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

      {/* §D 补给 + 恢复 (2 列) */}
      <ActivityFuelRecoverySection
        fuelForm={<ActivityFuelLogForm activityId={activity.id} fuelLog={fuelLog} />}
        recoveryCards={
          <ActivityRecoveryCards recovery={recovery} review={review} enabled={config.featureRecovery} />
        }
      />

      {/* §E 深度数据分析 (默认全展开) */}
      <ActivityDeepDataSection
        streamChart={
          hasStreamsForChart && streamData ? (
            <ActivityDetailView streams={streamData} ftp={ftp} maxHr={maxHr} />
          ) : (
            <div style={{ padding: "20px 0", color: "var(--muted)", fontSize: "0.9rem" }}>
              <p style={{ margin: "0 0 12px" }}>
                此活动尚未拉取流数据（功率/心率/踏频时间序列）。点击下方按钮从 {displayActivity.source} 补拉。
              </p>
              <SingleActivityBackfillButton activityId={displayActivity.id} />
            </div>
          )
        }
        rawFeatures={
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
        }
        recentCompare={
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
        }
        timeAnalysis={
          <div className="list-card">
            <h3>时序 / 分段</h3>
            {hasStreamData ? (
              <>
                <ul className="list">
                  <li>前半程功率：{features.stream_analysis?.first_half.avg_power ?? "--"} W</li>
                  <li>后半程功率：{features.stream_analysis?.second_half.avg_power ?? "--"} W</li>
                  <li>前半程心率：{features.stream_analysis?.first_half.avg_hr ?? "--"} bpm</li>
                  <li>后半程心率：{features.stream_analysis?.second_half.avg_hr ?? "--"} bpm</li>
                  <li>功率衰减：{features.stream_analysis?.fatigue_signals.power_fade_pct ?? "--"} %</li>
                  <li>心率漂移：{features.stream_analysis?.fatigue_signals.heart_rate_drift_pct ?? "--"} %</li>
                </ul>
                {features.stream_analysis?.segment_summaries?.length ? (
                  <ul className="list" style={{ marginTop: 8, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                    {features.stream_analysis.segment_summaries.slice(0, 3).map((segment) => (
                      <li key={segment.segment} style={{ fontSize: "0.85rem" }}>
                        第 {segment.segment} 段 ({segment.minute_range} min):
                        {" "}{segment.avg_power ?? "--"}W / {segment.avg_hr ?? "--"}bpm / {segment.avg_speed_kmh ?? "--"}km/h
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="muted">当前缺少流数据，时序分析暂不可用。</p>
            )}
          </div>
        }
      />

      {/* §F 极客模式 (folded) */}
      <ActivityGeekZone
        trainingBackground={
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
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
        }
        streamModal={<ActivityStreamModal rawStreamsJson={displayActivity.rawStreamsJson} />}
      />

      {/* §G Footer Actions */}
      <ActivityFooterActions
        activityId={displayActivity.id}
        hasStrava={Boolean(user.stravaAccessTokenEncrypted)}
      />
    </main>
  );
}
