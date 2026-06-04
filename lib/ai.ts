import { normalizeAiBaseUrl, parseAiJsonResponse } from "@/lib/ai-provider";
import { decryptSecret } from "@/lib/crypto";
import { buildActivityFeatures } from "@/lib/engine/activity-features";
import { buildRecoveryAdvice } from "@/lib/engine/recovery";
import { buildRideReview } from "@/lib/engine/review";
import { getAppConfig } from "@/lib/storage";
import type { Activity, AiChatMessage, FuelLog, RidePlan, User } from "@/lib/types";

const RAW_ATTACHMENT_KEYS = [
  "type",
  "start_date",
  "start_date_local",
  "moving_time",
  "elapsed_time",
  "distance",
  "average_speed",
  "max_speed",
  "average_heartrate",
  "max_heartrate",
  "average_watts",
  "max_watts",
  "weighted_average_watts",
  "icu_weighted_avg_watts",
  "average_cadence",
  "max_cadence",
  "total_elevation_gain",
  "elevation_gain",
  "suffer_score",
  "tss",
  "training_load",
  "icu_training_load",
  "intensity",
  "icu_intensity",
  "icu_ctl",
  "icu_atl",
  "icu_ts_b",
  "calories",
  "kilojoules",
  "work",
];

function buildRawAttachment(activity: Activity) {
  const raw = activity.rawSummaryJson ?? {};
  const picked = Object.fromEntries(
    RAW_ATTACHMENT_KEYS.filter((key) => key in raw).map((key) => [key, raw[key as keyof typeof raw]]),
  );

  return {
    top_level_summary: {
      distance_km: activity.distanceKm,
      moving_time_min: activity.movingTimeMin,
      elevation_m: activity.elevationM,
      avg_speed_kmh: activity.avgSpeedKmh,
      avg_hr: activity.avgHr,
      avg_power: activity.avgPower,
      np: activity.np,
      if: activity.ifValue,
      tss: activity.tss,
      recent_ctl: activity.recentCtl,
      recent_atl: activity.recentAtl,
      recent_form: activity.recentForm,
    },
    raw_fields: picked,
  };
}

function buildRecentComparison(current: Activity, recentActivities: Activity[]) {
  const isRideActivity = (activity: Activity) => {
    const type = String(activity.rawSummaryJson?.type ?? activity.rawSummaryJson?.activity_type ?? "").toLowerCase();
    const name = activity.name.toLowerCase();
    return type.includes("ride") || name.includes("骑行") || name.includes("ride");
  };

  const previous = recentActivities
    .filter((item) => item.id !== current.id && isRideActivity(item))
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, 7);

  if (!previous.length) {
    return null;
  }

  const average = (values: Array<number | undefined>) => {
    const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!usable.length) return undefined;
    return Number((usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(1));
  };

  const avgDuration = average(previous.map((item) => item.movingTimeMin));
  const avgDistance = average(previous.map((item) => item.distanceKm));
  const avgElevation = average(previous.map((item) => item.elevationM));
  const avgTss = average(previous.map((item) => item.tss));
  const avgIf = average(previous.map((item) => item.ifValue));

  return {
    sample_size: previous.length,
    recent_average: {
      duration_min: avgDuration,
      distance_km: avgDistance,
      elevation_m: avgElevation,
      tss: avgTss,
      if: avgIf,
    },
    current_vs_recent: {
      duration_delta_min: avgDuration ? Number((current.movingTimeMin - avgDuration).toFixed(1)) : undefined,
      distance_delta_km: avgDistance ? Number((current.distanceKm - avgDistance).toFixed(1)) : undefined,
      elevation_delta_m: avgElevation ? Number((current.elevationM - avgElevation).toFixed(1)) : undefined,
      tss_delta: avgTss && typeof current.tss === "number" ? Number((current.tss - avgTss).toFixed(1)) : undefined,
      if_delta: avgIf && typeof current.ifValue === "number" ? Number((current.ifValue - avgIf).toFixed(2)) : undefined,
    },
    recent_examples: previous.map((item) => ({
      name: item.name,
      start_time: item.startTime,
      distance_km: item.distanceKm,
      duration_min: item.movingTimeMin,
      elevation_m: item.elevationM,
      tss: item.tss,
      if: item.ifValue,
    })),
  };
}

type AiActivityContextInput = {
  activity: Activity;
  user: User;
  fuelLog?: FuelLog;
  referenceRidePlan?: RidePlan;
  recentActivities?: Activity[];
};

function normalizeFuelActualForAi(fuelLog?: FuelLog) {
  if (!fuelLog) return null;

  const carbOtherDesc = fuelLog.carbOtherDesc?.trim() || undefined;
  const symptoms = fuelLog.symptoms.filter(Boolean);
  const totalGels = fuelLog.gelCountActual > 0 ? fuelLog.gelCountActual : undefined;
  const doubleGels = (fuelLog.doubleGelCountActual ?? 0) > 0 ? fuelLog.doubleGelCountActual : undefined;
  const caffeineGels = (fuelLog.caffeineGelCountActual ?? 0) > 0 ? fuelLog.caffeineGelCountActual : undefined;
  const saltCapsules = (fuelLog.saltCapsuleCountActual ?? 0) > 0 ? fuelLog.saltCapsuleCountActual : undefined;
  const carbOtherGrams = (fuelLog.carbOtherGrams ?? 0) > 0 ? fuelLog.carbOtherGrams : undefined;
  const waterMl = fuelLog.waterMlActual > 0 ? fuelLog.waterMlActual : undefined;
  const electrolyte = fuelLog.electrolyteUsed ? true : undefined;
  const hasFuelEvidence = Boolean(
    totalGels || doubleGels || caffeineGels || saltCapsules || carbOtherGrams || waterMl || electrolyte || carbOtherDesc || symptoms.length,
  );

  return {
    fuel_data_status: hasFuelEvidence ? "provided" : "unknown_or_not_filled",
    total_gels: totalGels,
    double_gels: doubleGels,
    caffeine_gels: caffeineGels,
    gel_counting_rule:
      "total_gels is the total number of gels actually consumed. double_gels and caffeine_gels are subtypes already included in total_gels, so do not add them again.",
    salt_capsules: saltCapsules,
    carb_other_grams: carbOtherGrams,
    water_ml: waterMl,
    electrolyte,
    carb_other_desc: carbOtherDesc,
    fatigue_score: fuelLog.fatigueScore,
    leg_fatigue_score: fuelLog.legFatigueScore,
    symptoms: symptoms.length ? symptoms : undefined,
  };
}

function getAiConfigError(config: Awaited<ReturnType<typeof getAppConfig>>) {
  if (!config.aiEnabled || !config.aiBaseUrl || !config.aiModel || !config.aiApiKeyEncrypted) {
    throw new Error("管理员尚未完成 AI 配置。");
  }
}

function buildActivityAiContext(input: AiActivityContextInput) {
  const review = buildRideReview(input);
  const recovery = buildRecoveryAdvice(input);
  const activityFeatures = buildActivityFeatures(input);

  return {
    review,
    recovery,
    activityFeatures,
    activitySummary: {
      distance_km: input.activity.distanceKm,
      duration_min: input.activity.movingTimeMin,
      elevation_m: input.activity.elevationM,
      avg_speed_kmh: input.activity.avgSpeedKmh,
      avg_hr: input.activity.avgHr,
      avg_power: input.activity.avgPower,
      np: input.activity.np,
      if: input.activity.ifValue,
      tss: input.activity.tss,
      temperature_c: input.activity.temperatureC,
      recent_ctl: input.activity.recentCtl,
      recent_atl: input.activity.recentAtl,
      recent_form: input.activity.recentForm,
    },
    userContext: {
      weight_kg: input.user.weightKg,
      ftp: input.user.ftp,
      threshold_hr: input.user.thresholdHr,
      max_hr: input.user.maxHr,
      resting_hr: input.user.restingHr,
    },
    fuelActual: normalizeFuelActualForAi(input.fuelLog),
    recentComparison: buildRecentComparison(input.activity, input.recentActivities ?? []),
    activityAttachment: buildRawAttachment(input.activity),
    observedHeartRate: {
      avg_hr: input.activity.avgHr,
      max_hr_this_ride: typeof input.activity.rawSummaryJson?.max_heartrate === "number"
        ? (input.activity.rawSummaryJson.max_heartrate as number)
        : typeof input.activity.rawSummaryJson?.max_hr === "number"
          ? (input.activity.rawSummaryJson.max_hr as number)
          : undefined,
      min_hr_this_ride: typeof input.activity.rawSummaryJson?.min_heartrate === "number"
        ? (input.activity.rawSummaryJson.min_heartrate as number)
        : typeof input.activity.rawSummaryJson?.min_hr === "number"
          ? (input.activity.rawSummaryJson.min_hr as number)
          : undefined,
    },
  };
}

export async function generateAiNarrative(input: AiActivityContextInput) {
  const config = await getAppConfig();
  getAiConfigError(config);
  const context = buildActivityAiContext(input);
  const apiKey = decryptSecret(config.aiApiKeyEncrypted!);
  const aiBaseUrl = config.aiBaseUrl!;
  const aiModel = config.aiModel!;

  const payload = {
    model: aiModel,
    messages: [
      {
        role: "system",
        content:
          config.aiSystemPrompt ||
          [
            "你是一名真正懂骑行训练数据、功率分析、补给和恢复的中文 AI 助手。",
            "你不是客服口吻，也不要泛泛而谈。",
            "你必须像教练复盘一样写，基于数据做判断，明确指出亮点、问题、原因、训练意义、恢复建议和下次建议。",
            "输出必须保留良好的排版，使用自然的标题和项目符号，适合直接展示给用户。",
            "允许适量使用 emoji 作为结构提示，例如 🚴、✅、⚠️、📌、📈，但要克制，重点是提升可读性，不要花哨堆砌。",
            "如果数据不足，要明确说“基于现有数据推测”。",
          ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            activity_summary: context.activitySummary,
            user_context: context.userContext,
            fuel_actual: context.fuelActual,
            engine_review: context.review,
            engine_recovery: context.recovery,
            derived_features: context.activityFeatures,
            recent_comparison: context.recentComparison,
            activity_attachment: context.activityAttachment,
            heart_rate_interpretation_guardrails: {
              athlete_profile_max_hr: context.userContext.max_hr,
              athlete_profile_threshold_hr: context.userContext.threshold_hr,
              athlete_profile_resting_hr: context.userContext.resting_hr,
              observed_this_ride: context.observedHeartRate,
              instruction:
                "如果 athlete_profile_max_hr / threshold_hr / resting_hr 有值，必须优先按这些用户档案值解释，不要把本次活动里的 max_heartrate 误写成用户的最大心率。活动里的 max_heartrate 只代表本次骑行观测到的峰值。",
            },
            task:
              [
                "请输出 JSON，字段仍为 review_text、recovery_text、fuel_review_text。",
                "但三个字段的内容都不要机械拆开写成三段短句。",
                "其中 review_text 请写成一篇完整的中文骑行复盘主报告，直接面向用户展示，允许带标题、空行、项目符号。",
                "风格参考专业教练复盘，结构建议尽量接近：",
                "1. 先用 1-2 句总结这次训练的性质和完成度。",
                "2. 给出“先看结论”或“一句话判断”。",
                "3. 展开写“哪些方面做得好”。",
                "4. 展开写“哪些方面可以改进”。",
                "5. 解释这些现象背后的原因，尤其结合 IF、TSS、功率、心率、补给、近期负荷、时序特征、前后半程和漂移。",
                "6. 单独写“这节课对后续训练的意义”。",
                "7. 最后给“建议安排下次怎么练”。",
              "要求内容具体、有判断、有证据，不要空洞鸡汤。",
              "如果拿到了流数据和分段数据，要优先引用这些底层特征。",
              "严格区分用户档案阈值和本次活动观测值，例如：用户最大心率、阈值心率、静息心率，与本次骑行最大心率不是一回事。",
              "如果 fuel_data_status 是 unknown_or_not_filled，说明补给记录没有可靠填写，不要因为 0 胶、0 饮水就直接判断用户真的没吃没喝，也不要基于这组 0 值做强结论。",
              "如果 fuel_actual 同时给了 total_gels、double_gels、caffeine_gels，要把 double_gels 和 caffeine_gels 视为 total_gels 的分类，不要重复累计或重复表述。",
              "允许适量使用 emoji 增强结构和可读性，但不要每行都加。",
              "recovery_text 输出精简恢复建议，fuel_review_text 输出精简补给复盘，可短一些。",
            ].join(" "),
          },
          null,
          2,
        ),
      },
    ],
    response_format: {
      type: "json_object",
    },
  };

  const response = await fetch(normalizeAiBaseUrl(aiBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await parseAiJsonResponse(response);

  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI 返回为空。");
  }

  const parsed = JSON.parse(content) as {
    review_text: string;
    recovery_text: string;
    fuel_review_text: string;
  };

  return {
    reviewText: parsed.review_text,
    recoveryText: parsed.recovery_text,
    fuelReviewText: parsed.fuel_review_text,
    model: aiModel,
  };
}

export async function generateActivityChatReply(input: AiActivityContextInput & {
  aiReport?: string;
  messages: AiChatMessage[];
  question: string;
}) {
  const config = await getAppConfig();
  getAiConfigError(config);
  const context = buildActivityAiContext(input);
  const apiKey = decryptSecret(config.aiApiKeyEncrypted!);
  const aiBaseUrl = config.aiBaseUrl!;
  const aiModel = config.aiModel!;

  const history = input.messages.slice(-12).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const response = await fetch(normalizeAiBaseUrl(aiBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        {
          role: "system",
          content:
            config.aiSystemPrompt ||
            [
              "你是一名中文骑行教练型 AI，擅长基于完整骑行底层数据做追问式分析。",
              "你的回答要直接、专业、可执行，不要客服口吻，不要泛泛鸡汤。",
              "用户会继续追问这次骑行问题、补给问题或后续训练计划，你要结合上下文连续回答。",
              "允许使用标题、短段落、项目符号，保留自然排版，适合直接展示在产品聊天区。",
              "允许适量使用 emoji 做结构提示，但不要花哨。",
              "如果信息不足，明确说基于现有数据推测，并指出还缺什么数据。",
            ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              task: [
              "下面是一条骑行活动的完整上下文，请基于它回答用户最后一个问题。",
              "要优先引用底层数据、时序分析、近期负荷、补给记录和已有 AI 报告。",
              "如果用户问后续训练计划，给出未来 2-7 天的实际安排建议，强度、时长、目的要具体。",
              "如果用户问本次骑行问题，先明确结论，再解释原因，再给下一步动作。",
              "如果 fuel_data_status 是 unknown_or_not_filled，说明补给记录不可靠，不要因为 0 胶、0 饮水就武断地下补给不足结论。",
              "如果 fuel_actual 同时给了 total_gels、double_gels、caffeine_gels，要把 double_gels 和 caffeine_gels 视为 total_gels 的分类，不要重复累计或重复表述。",
              "允许适量使用 emoji 增强可读性。",
              "不要输出 JSON，直接输出自然中文富文本。",
            ].join(" "),
              activity_summary: context.activitySummary,
              user_context: context.userContext,
              fuel_actual: context.fuelActual,
              engine_review: context.review,
              engine_recovery: context.recovery,
              derived_features: context.activityFeatures,
              recent_comparison: context.recentComparison,
              activity_attachment: context.activityAttachment,
              heart_rate_interpretation_guardrails: {
                athlete_profile_max_hr: context.userContext.max_hr,
                athlete_profile_threshold_hr: context.userContext.threshold_hr,
                athlete_profile_resting_hr: context.userContext.resting_hr,
                observed_this_ride: context.observedHeartRate,
                instruction:
                  "优先使用用户档案中的最大心率、阈值心率、静息心率。活动里的 max_heartrate / min_heartrate 只是本次骑行观测值，不要误写为用户长期阈值。",
              },
              latest_ai_report: input.aiReport ?? null,
              conversation_history: history,
              latest_question: input.question,
            },
            null,
            2,
          ),
        },
      ],
    }),
  });

  const json = await parseAiJsonResponse(response);
  const content = json.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("AI 对话返回为空。");
  }

  return {
    reply: content,
    model: aiModel,
  };
}

export async function streamAiReportNarrative(
  input: AiActivityContextInput & {
    onDelta: (chunk: string) => Promise<void> | void;
  },
) {
  const config = await getAppConfig();
  getAiConfigError(config);
  const context = buildActivityAiContext(input);
  const apiKey = decryptSecret(config.aiApiKeyEncrypted!);
  const aiBaseUrl = config.aiBaseUrl!;
  const aiModel = config.aiModel!;

  const response = await fetch(normalizeAiBaseUrl(aiBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: aiModel,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            config.aiSystemPrompt ||
            [
              "你是一名真正懂骑行训练数据、功率分析、补给和恢复的中文 AI 助手。",
              "你必须像教练复盘一样写，基于数据做判断，明确指出亮点、问题、原因、训练意义、恢复建议和下次建议。",
              "输出必须保留自然排版，适合直接在产品里全文展示。",
              "允许适量使用 emoji 作为结构提示，但不要滥用。",
              "如果数据不足，要明确说基于现有数据推测。",
            ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              activity_summary: context.activitySummary,
              user_context: context.userContext,
              fuel_actual: context.fuelActual,
              engine_review: context.review,
              engine_recovery: context.recovery,
              derived_features: context.activityFeatures,
              recent_comparison: context.recentComparison,
              activity_attachment: context.activityAttachment,
              heart_rate_interpretation_guardrails: {
                athlete_profile_max_hr: context.userContext.max_hr,
                athlete_profile_threshold_hr: context.userContext.threshold_hr,
                athlete_profile_resting_hr: context.userContext.resting_hr,
                observed_this_ride: context.observedHeartRate,
                instruction:
                  "如果 athlete_profile_max_hr / threshold_hr / resting_hr 有值，必须优先按这些用户档案值解释，不要把本次活动里的 max_heartrate 误写成用户的最大心率。活动里的 max_heartrate 只代表本次骑行观测到的峰值。",
              },
              task: [
                "请直接输出一篇完整的中文骑行复盘主报告，不要输出 JSON。",
                "风格要像专业教练给车手的赛后复盘，可直接展示给用户。",
                "结构建议：先看结论、哪些地方做得好、哪些地方可以改进、原因分析、这节训练的意义、下次怎么练。",
                "要尽量引用 IF、TSS、功率、心率、近期负荷、时序特征、前后半程和漂移等数据证据。",
                "严格区分用户档案阈值和本次活动观测值。",
                "如果 fuel_data_status 是 unknown_or_not_filled，说明补给记录没有可靠填写，不要因为 0 胶、0 饮水就直接判断用户真的没吃没喝。",
                "如果 fuel_actual 同时给了 total_gels、double_gels、caffeine_gels，要把 double_gels 和 caffeine_gels 视为 total_gels 的分类，不要重复累计或重复表述。",
                "允许适量使用 emoji 增强结构和可读性。",
                "允许标题、空行、项目符号，保留自然格式。",
              ].join(" "),
            },
            null,
            2,
          ),
        },
      ],
    }),
  });

  if (!response.ok) {
    const short = (await response.text()).slice(0, 220);
    throw new Error(`AI 调用失败：${response.status} ${short}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const json = await parseAiJsonResponse(response);
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("AI 报告返回为空。");
    }
    await input.onDelta(content);
    return {
      reviewText: content,
      recoveryText: "",
      fuelReviewText: "",
      model: aiModel,
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("AI 流式输出不可用。");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  const handleDataLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return false;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") {
      return payload === "[DONE]";
    }

    const json = JSON.parse(payload) as {
      choices?: Array<{
        delta?: { content?: string };
        message?: { content?: string };
      }>;
    };

    const chunk = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
    if (chunk) {
      fullText += chunk;
      await input.onDelta(chunk);
    }
    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const lines = event.split("\n");
      for (const line of lines) {
        const finished = await handleDataLine(line);
        if (finished) {
          return {
            reviewText: fullText.trim(),
            recoveryText: "",
            fuelReviewText: "",
            model: aiModel,
          };
        }
      }
    }
  }

  if (!fullText.trim()) {
    throw new Error("AI 报告返回为空。");
  }

  return {
    reviewText: fullText.trim(),
    recoveryText: "",
    fuelReviewText: "",
    model: aiModel,
  };
}

export async function streamActivityChatReply(
  input: AiActivityContextInput & {
    aiReport?: string;
    messages: AiChatMessage[];
    question: string;
    onDelta: (chunk: string) => Promise<void> | void;
  },
) {
  const config = await getAppConfig();
  getAiConfigError(config);
  const context = buildActivityAiContext(input);
  const apiKey = decryptSecret(config.aiApiKeyEncrypted!);
  const aiBaseUrl = config.aiBaseUrl!;
  const aiModel = config.aiModel!;

  const history = input.messages.slice(-12).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const response = await fetch(normalizeAiBaseUrl(aiBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: aiModel,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            config.aiSystemPrompt ||
            [
              "你是一名中文骑行教练型 AI，擅长基于完整骑行底层数据做追问式分析。",
              "你的回答要直接、专业、可执行，不要客服口吻，不要泛泛鸡汤。",
              "用户会继续追问这次骑行问题、补给问题或后续训练计划，你要结合上下文连续回答。",
              "允许使用标题、短段落、项目符号，保留自然排版，适合直接展示在产品聊天区。",
              "如果信息不足，明确说基于现有数据推测，并指出还缺什么数据。",
            ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              task: [
                "下面是一条骑行活动的完整上下文，请基于它回答用户最后一个问题。",
                "要优先引用底层数据、时序分析、近期负荷、补给记录和已有 AI 报告。",
                "如果用户问后续训练计划，给出未来 2-7 天的实际安排建议，强度、时长、目的要具体。",
                "如果用户问本次骑行问题，先明确结论，再解释原因，再给下一步动作。",
                "如果 fuel_actual 同时给了 total_gels、double_gels、caffeine_gels，要把 double_gels 和 caffeine_gels 视为 total_gels 的分类，不要重复累计或重复表述。",
                "不要输出 JSON，直接输出自然中文富文本。",
              ].join(" "),
              activity_summary: context.activitySummary,
              user_context: context.userContext,
              fuel_actual: context.fuelActual,
              engine_review: context.review,
              engine_recovery: context.recovery,
              derived_features: context.activityFeatures,
              recent_comparison: context.recentComparison,
              activity_attachment: context.activityAttachment,
              heart_rate_interpretation_guardrails: {
                athlete_profile_max_hr: context.userContext.max_hr,
                athlete_profile_threshold_hr: context.userContext.threshold_hr,
                athlete_profile_resting_hr: context.userContext.resting_hr,
                observed_this_ride: context.observedHeartRate,
                instruction:
                  "优先使用用户档案中的最大心率、阈值心率、静息心率。活动里的 max_heartrate / min_heartrate 只是本次骑行观测值，不要误写为用户长期阈值。",
              },
              latest_ai_report: input.aiReport ?? null,
              conversation_history: history,
              latest_question: input.question,
            },
            null,
            2,
          ),
        },
      ],
    }),
  });

  if (!response.ok) {
    const short = (await response.text()).slice(0, 220);
    throw new Error(`AI 调用失败：${response.status} ${short}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/event-stream")) {
    const json = await parseAiJsonResponse(response);
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("AI 对话返回为空。");
    }
    await input.onDelta(content);
    return {
      reply: content,
      model: aiModel,
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("AI 流式输出不可用。");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  const handleDataLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return false;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") {
      return payload === "[DONE]";
    }

    const json = JSON.parse(payload) as {
      choices?: Array<{
        delta?: { content?: string };
        message?: { content?: string };
      }>;
    };

    const chunk = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
    if (chunk) {
      fullText += chunk;
      await input.onDelta(chunk);
    }
    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const lines = event.split("\n");
      for (const line of lines) {
        const finished = await handleDataLine(line);
        if (finished) {
          return {
            reply: fullText.trim(),
            model: aiModel,
          };
        }
      }
    }
  }

  if (!fullText.trim()) {
    throw new Error("AI 对话返回为空。");
  }

  return {
    reply: fullText.trim(),
    model: aiModel,
  };
}
