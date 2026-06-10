import type { Action, Parameter } from "@copilotkit/shared";
import type { User } from "@/lib/types";
import { loadAnalyticsData, asActivities } from "@/lib/analytics-data";
import {
  listDailyWellness,
  listActivitiesByUser,
  getActivity,
  getAiReportByActivityId,
  listUserSegments,
  listAllSegmentEffortsByUser,
  listSegmentEffortsBySegment,
} from "@/lib/storage";
import { calculatePmc, getCurrentPmc, getPmcOneWeekAgo, detectTrainingPhase } from "@/lib/engine/pmc";
import { buildPowerCurve, getKeyPowers } from "@/lib/engine/power-curve";
import { computeReadiness } from "@/lib/engine/readiness-engine";
import { estimateFtpFromActivities, buildFtpProgression } from "@/lib/engine/ftp-estimator";
import { evaluateLevel } from "@/lib/engine/cycling-levels";
import { generateUpgradePlan } from "@/lib/engine/level-progression";
import { predictEta } from "@/lib/engine/level-eta";
import { calculateRecoveryScores, predictRecovery } from "@/lib/engine/recovery-engine";
import { calculatePersonalBests } from "@/lib/engine/personal-best";
import { buildSegmentHistory } from "@/lib/engine/segments/segments-history";
import { recommendSegments } from "@/lib/engine/segments/segments-recommend";
import { buildRideReview } from "@/lib/engine/review";
import { runIntervalsSync } from "@/lib/intervals-sync";
import { runStravaSync } from "@/lib/strava-sync";

export function buildCopilotActions(user: User): Action<any>[] {
  const weightKg = user.weightKg ?? user.syncedWeightKg ?? undefined;

  return [
    {
      name: "getTrainingLoad",
      description:
        "获取训练负荷概览：CTL（长期负荷）、ATL（短期负荷）、TSB（训练压力平衡）、训练阶段判断、周TSS趋势。用户问「训练负荷」「PMC」「疲劳」「状态」时调用。",
      parameters: [],
      handler: async () => {
        const data = await loadAnalyticsData(user);
        const activities = asActivities(data.activities);
        const pmcData = calculatePmc(activities);
        const current = getCurrentPmc(pmcData);
        const weekAgo = getPmcOneWeekAgo(pmcData);
        const phase = detectTrainingPhase(pmcData);

        const recent7 = pmcData.slice(-7);
        const weeklyTss = recent7.reduce((sum, d) => sum + d.dailyTss, 0);

        return {
          current: current
            ? { ctl: current.ctl, atl: current.atl, tsb: current.tsb }
            : null,
          weekAgo: weekAgo
            ? { ctl: weekAgo.ctl, atl: weekAgo.atl, tsb: weekAgo.tsb }
            : null,
          ctlChange: current && weekAgo ? +(current.ctl - weekAgo.ctl).toFixed(1) : null,
          weeklyTss: Math.round(weeklyTss),
          phase: { name: phase.label, description: phase.description },
          totalActivities: data.activities.length,
        };
      },
    },

    {
      name: "getPowerProfile",
      description:
        "获取功率曲线概览：5秒/1分钟/5分钟/20分钟/60分钟最佳功率及W/kg。用户问「功率」「power curve」「最大功率」时调用。",
      parameters: [],
      handler: async () => {
        const data = await loadAnalyticsData(user);
        const activities = asActivities(data.activities);
        const { curve } = buildPowerCurve(activities, weightKg);
        const keyPowers = getKeyPowers(curve);

        const formatted = Object.entries(keyPowers)
          .filter(([, v]) => v !== null)
          .map(([label, kp]) => ({
            label,
            power: kp!.power,
            wpkg: kp!.wpkg,
            activityName: kp!.activityName,
            date: kp!.activityDate,
          }));

        return {
          keyPowers: formatted,
          totalPointsOnCurve: curve.length,
          weightKg,
        };
      },
    },

    {
      name: "getReadiness",
      description:
        "获取今日训练就绪度评分（0-100）和四因子分析（HRV、静息心率、睡眠、训练负荷）。用户问「就绪度」「今天状态」「能不能练」时调用。",
      parameters: [],
      handler: async () => {
        const [recent7, baseline30, activities] = await Promise.all([
          listDailyWellness(user.id, 7),
          listDailyWellness(user.id, 30),
          listActivitiesByUser(user.id),
        ]);

        const today = new Date().toISOString().slice(0, 10);
        const todayEntry = recent7.find((d) => d.date === today) ?? {
          id: "",
          userId: user.id,
          date: today,
          restingHr: null,
          hrv: null,
          sleepSecs: null,
          sleepScore: null,
          weight: null,
          spO2: null,
          steps: null,
          statusTag: null,
          note: null,
          readinessScore: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const pmcData = calculatePmc(activities);
        const currentPmc = getCurrentPmc(pmcData);
        const tsb = currentPmc?.tsb;

        const result = computeReadiness(todayEntry, recent7, baseline30, tsb);

        return {
          score: result.score,
          label: result.label,
          factors: result.factors.map((f) => ({
            name: f.name,
            score: f.score,
            detail: f.detail,
          })),
          suggestions: result.suggestions,
        };
      },
    },

    {
      name: "getFtpAnalysis",
      description:
        "估算FTP（功能阈值功率）和历史FTP趋势。包含CP/W'模型、各时长估算值、置信度。用户问「FTP」「阈值功率」「能力变化」时调用。",
      parameters: [],
      handler: async () => {
        const data = await loadAnalyticsData(user);
        const activities = asActivities(data.activities);
        const estimate = estimateFtpFromActivities(activities, weightKg);
        const progression = buildFtpProgression(activities, weightKg);

        return {
          current: estimate
            ? {
                ftp: estimate.ftp,
                wpkg: estimate.wpkg,
                method: estimate.method,
                confidence: estimate.confidence,
                criticalPower: estimate.criticalPower,
              }
            : null,
          userSetFtp: user.ftp,
          progression: progression.slice(-12),
        };
      },
    },

    {
      name: "getLevel",
      description:
        "评估骑行能力等级（L0入门骑友 ~ L11职业），六维雷达（5s爆发/1min无氧/5min VO2/FTP/60min耐力/VO2max），含升级训练计划和达成预测。用户问「等级」「段位」「水平」时调用。",
      parameters: [],
      handler: async () => {
        const data = await loadAnalyticsData(user);
        const activities = asActivities(data.activities);
        const evalResult = evaluateLevel({ activities, user });
        const plan = generateUpgradePlan(evalResult);
        const pmcData = calculatePmc(activities);
        const eta = predictEta(evalResult, pmcData);

        const dimensions = Object.entries(evalResult.byDimension).map(
          ([key, dim]) => ({
            dimension: key,
            label: dim.label,
            value: dim.value,
            unit: dim.unit,
            level: dim.level,
            levelName: dim.label,
            gapToNext: dim.gapValue,
          }),
        );

        return {
          overall: {
            level: evalResult.overall.level,
            label: evalResult.overall.label,
          },
          dimensions,
          upgradePlan: plan.block
            ? {
                targetDimension: plan.targetDimension,
                blockName: plan.block.name,
                sessions: plan.block.sessions,
                expectedGain: plan.block.expectedGain,
              }
            : plan.skip
              ? { note: plan.skip }
              : null,
          eta: {
            weeks: eta.weeks === Infinity ? null : eta.weeks,
            confidence: eta.confidence,
            note: eta.note,
          },
          warnings: evalResult.warnings,
        };
      },
    },

    {
      name: "getRecovery",
      description:
        "获取恢复状态评分和预测。包含近14天恢复趋势、恢复到满状态所需天数。用户问「恢复」「休息」「疲劳」时调用。",
      parameters: [],
      handler: async () => {
        const data = await loadAnalyticsData(user);
        const activities = asActivities(data.activities);
        const pmcData = calculatePmc(activities);
        const scores = calculateRecoveryScores(pmcData, activities, 14);
        const prediction = predictRecovery(scores);
        const latest = scores[scores.length - 1];

        return {
          current: latest
            ? {
                score: latest.score,
                level: latest.level,
                label: latest.label,
              }
            : null,
          prediction: {
            daysToFull: prediction.daysToFull,
            currentRate: prediction.currentRate,
          },
          recentTrend: scores.slice(-7).map((s) => ({
            date: s.date,
            score: s.score,
            label: s.label,
          })),
        };
      },
    },

    {
      name: "getRecentActivities",
      description:
        "获取最近骑行活动列表，含距离、时长、TSS、平均功率等摘要。用户问「最近骑行」「训练记录」「上次骑行」时调用。",
      parameters: [
        {
          name: "count",
          type: "number",
          description: "返回条数，默认10",
          required: false,
        },
      ],
      handler: async ({ count }: any) => {
        const data = await loadAnalyticsData(user);
        const n = count ?? 10;
        const recent = data.activities
          .sort(
            (a, b) =>
              new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
          )
          .slice(0, n);

        return {
          activities: recent.map((a) => ({
            id: a.id,
            name: a.name,
            date: a.startTime,
            distanceKm: a.distanceKm,
            durationMin: a.movingTimeMin,
            tss: a.tss ? Math.round(a.tss) : null,
            avgPower: a.avgPower,
            normalizedPower: a.np,
            avgHr: a.avgHr,
            elevationM: a.elevationM,
          })),
          total: data.activities.length,
        };
      },
    },

    {
      name: "getActivityDetail",
      description:
        "获取单次骑行的详细数据，包括AI分析报告、骑行回顾。需要提供activityId。用户问某次具体骑行的详情时调用。",
      parameters: [
        {
          name: "activityId",
          type: "string",
          description: "活动ID",
          required: true,
        },
      ],
      handler: async ({ activityId }: any) => {
        const activity = await getActivity(activityId);
        if (!activity) return { error: "活动不存在" };
        if (activity.userId !== user.id) return { error: "无权查看" };

        const aiReport = await getAiReportByActivityId(activityId);
        const review = buildRideReview({ activity });

        return {
          name: activity.name,
          date: activity.startTime,
          distanceKm: activity.distanceKm,
          durationMin: activity.movingTimeMin,
          tss: activity.tss,
          avgPower: activity.avgPower,
          normalizedPower: activity.np,
          intensityFactor: activity.ifValue,
          avgHr: activity.avgHr,
          elevationM: activity.elevationM,
          review: review ?? null,
          aiReport: aiReport
            ? {
                reviewText: aiReport.reviewText,
                recoveryText: aiReport.recoveryText,
                fuelReviewText: aiReport.fuelReviewText,
                generatedAt: aiReport.generatedAt,
              }
            : null,
        };
      },
    },

    {
      name: "syncTrainingData",
      description:
        "同步训练数据。从intervals.icu或Strava拉取最新骑行记录到系统。用户说「同步」「拉数据」「更新数据」时调用。",
      parameters: [
        {
          name: "source",
          type: "string",
          description: "数据源",
          required: true,
          enum: ["intervals", "strava"],
        },
        {
          name: "mode",
          type: "string",
          description: "同步模式：incremental（增量，默认）或 full（全量）",
          required: false,
          enum: ["incremental", "full"],
        },
      ],
      handler: async ({ source, mode }: any) => {
        try {
          if (source === "intervals") {
            const result = await runIntervalsSync({
              user,
              mode: mode ?? "incremental",
            });
            return {
              success: true,
              source: "intervals.icu",
              ...result,
            };
          } else {
            const result = await runStravaSync({
              user,
              mode: mode ?? "incremental",
            });
            return {
              success: true,
              source: "strava",
              ...result,
            };
          }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : "同步失败",
          };
        }
      },
    },

    {
      name: "getSegmentAnalysis",
      description:
        "获取赛段（Segment）分析：用户的赛段列表、历史趋势、PR记录、推荐赛段。用户问「赛段」「segment」「KOM」时调用。",
      parameters: [],
      handler: async () => {
        const [segments, efforts] = await Promise.all([
          listUserSegments(user.id),
          listAllSegmentEffortsByUser(user.id),
        ]);

        if (segments.length === 0) {
          return { segments: [], message: "暂无赛段数据，需要先同步含赛段的骑行记录" };
        }

        const segmentSummaries = segments.slice(0, 20).map((seg) => {
          const segEfforts = efforts.filter((e) => e.segmentId === seg.id);
          const history = buildSegmentHistory(segEfforts as any, seg as any);
          return {
            id: seg.id,
            name: seg.name,
            distanceKm: seg.distance
              ? +(seg.distance / 1000).toFixed(1)
              : null,
            avgGrade: seg.averageGrade,
            effortCount: segEfforts.length,
            bestTimeSec: history.bestTime,
            avgTimeSec: history.avgTime,
            improvementPct: history.improvementPct,
            trend: history.recentTrend,
          };
        });

        return {
          totalSegments: segments.length,
          totalEfforts: efforts.length,
          segments: segmentSummaries,
        };
      },
    },

    {
      name: "getPersonalBests",
      description:
        "获取各时长的个人最佳功率记录（PB），含达成日期和近30天新纪录标记。用户问「个人纪录」「PB」「最好成绩」时调用。",
      parameters: [],
      handler: async () => {
        const data = await loadAnalyticsData(user);
        const activities = asActivities(data.activities);
        const pbs = calculatePersonalBests(activities, weightKg);

        return {
          records: pbs.records.map((pb) => ({
            duration: pb.durationLabel,
            power: pb.power,
            wpkg: pb.wpkg,
            activityName: pb.activityName,
            achievedAt: pb.achievedAt,
            isNew: pb.isNew,
          })),
          weightKg,
        };
      },
    },

    {
      name: "getUserProfile",
      description:
        "获取用户当前已配置的个人资料，包括FTP、体重、心率等。用户问「我的信息」「我的设置」时调用。",
      parameters: [],
      handler: async () => ({
        name: user.name,
        userType: user.userType,
        ftp: user.ftp,
        weightKg: user.weightKg,
        syncedFtp: user.syncedFtp,
        syncedWeightKg: user.syncedWeightKg,
        maxHr: user.maxHr,
        thresholdHr: user.thresholdHr,
        restingHr: user.restingHr,
        primaryDevice: user.primaryDevice,
        onboardingStatus: user.onboardingStatus,
        hasIntervalsKey: !!user.intervalsApiKeyEncrypted,
        hasStravaConnection: !!user.stravaAthleteId,
      }),
    },
  ];
}
