import { normalizeAiBaseUrl } from "@/lib/ai-provider";
import { decryptSecret } from "@/lib/crypto";
import { getAppConfig } from "@/lib/storage";
import type { RouteProfile } from "@/lib/engine/gpx-parser";
import { analyzeTactics, type RiderProfile, type TacticsAnalysis } from "@/lib/engine/tactics-engine";

export interface TacticsPlan {
  overview: string;
  segments: TacticsSegment[];
  keyMoments: KeyMoment[];
  riskFactors: string[];
}

interface TacticsSegment {
  segmentIndex: number;
  description: string;
  pace: string;
  formation: string;
  goal: string;
}

interface KeyMoment {
  atKm: number;
  action: string;
  who: string;
  why: string;
  targetPower: string;
}

function buildTacticsPrompt(
  route: RouteProfile,
  riders: RiderProfile[],
  analysis: TacticsAnalysis,
  weatherNote?: string,
): string {
  const team = riders.filter((r) => r.role === "self" || r.role === "teammate");
  const opponents = riders.filter((r) => r.role === "opponent");

  const segmentSummary = route.segments
    .map((s, i) => `  段${i + 1}: ${s.startKm}-${s.endKm}km, ${s.avgGradePct}% 坡度, ${s.category}, 爬升${s.elevationGainM}m`)
    .join("\n");

  const teamSummary = team
    .map((r) => `  ${r.name}(${r.role}): FTP=${r.ftp}W, ${r.weightKg}kg, ${(r.ftp / r.weightKg).toFixed(2)}W/kg${r.strength ? `, 特长:${r.strength}` : ""}${r.weakness ? `, 弱点:${r.weakness}` : ""}`)
    .join("\n");

  const oppSummary = opponents
    .map((r) => `  ${r.name}: FTP=${r.ftp}W, ${r.weightKg}kg, ${(r.ftp / r.weightKg).toFixed(2)}W/kg${r.strength ? `, 特长:${r.strength}` : ""}${r.weakness ? `, 弱点:${r.weakness}` : ""}`)
    .join("\n");

  const vulnSummary = analysis.opponentVulnerabilities
    .slice(0, 5)
    .map((v) => `  ${v.name} 在段${v.segmentIndex + 1}: ${v.reason}`)
    .join("\n");

  const advSummary = analysis.teamAdvantageZones
    .map((a) => `  段${a.segmentIndex + 1}: ${a.advantage} (${a.who}可领骑)`)
    .join("\n");

  return `你是一位经验丰富的自行车赛事战术总监(DS)，擅长利用团队优势和路线特征制定"拉爆"对手的策略。

比赛路线: ${route.totalDistanceKm}km, 总爬升${route.totalElevationM}m
预估用时: 约${analysis.totalRaceEstimateMin}分钟
${weatherNote ? `天气: ${weatherNote}` : ""}

路线分段:
${segmentSummary}

我方阵容:
${teamSummary}

对手:
${oppSummary}

引擎分析—对手弱点:
${vulnSummary || "  无明显弱点"}

引擎分析—我方优势段:
${advSummary || "  无明显优势段"}

请制定一个完整的比赛战术方案，核心目标是"把对手拉爆"。

要求以 JSON 格式返回，结构如下:
{
  "overview": "总体策略概述（2-3句）",
  "segments": [
    {
      "segmentIndex": 0,
      "description": "段描述",
      "pace": "节奏建议（如 250W 稳定输出）",
      "formation": "队形/分工",
      "goal": "本段目标"
    }
  ],
  "keyMoments": [
    {
      "atKm": 15.0,
      "action": "发起攻击",
      "who": "执行人",
      "why": "战术原因",
      "targetPower": "5min @ 320W"
    }
  ],
  "riskFactors": ["风险提示1", "风险提示2"]
}

只返回 JSON，不要其他文字。`;
}

export async function generateTactics(
  route: RouteProfile,
  riders: RiderProfile[],
  weatherNote?: string,
): Promise<TacticsPlan> {
  const config = await getAppConfig();
  if (!config.aiEnabled || !config.aiBaseUrl || !config.aiApiKeyEncrypted || !config.aiModel) {
    throw new Error("AI 未配置。请在设置中填写 API 地址和密钥。");
  }

  const validRiders = riders.filter((r) => r.ftp > 0 && r.weightKg > 0);
  if (validRiders.length === 0) {
    throw new Error("至少需要一名有效骑手数据（FTP + 体重）");
  }

  const analysis = analyzeTactics(route, validRiders);
  const prompt = buildTacticsPrompt(route, validRiders, analysis, weatherNote);

  const apiKey = decryptSecret(config.aiApiKeyEncrypted);
  const url = normalizeAiBaseUrl(config.aiBaseUrl);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.aiModel,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const text = (await response.text()).slice(0, 200);
    throw new Error(`AI 调用失败: ${response.status} ${text}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI 返回为空");
  }

  const tactics: TacticsPlan = JSON.parse(content);
  return tactics;
}
