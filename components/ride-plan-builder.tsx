"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { buildFuelPlan } from "@/lib/engine/fuel";
import { formatDuration } from "@/lib/format";
import type { RidePlan } from "@/lib/types";

type BuilderDraft = {
  distanceKm: string;
  elevationM: string;
  expectedSpeedKmh: string;
  expectedDurationMin: string;
  rideType: RidePlan["rideType"];
  temperatureC: string;
  weightKg: string;
  fuelPreference: RidePlan["fuelPreference"];
  breakfastStatus: RidePlan["breakfastStatus"];
  isHotHumid: boolean;
  hasResupply: boolean;
  caffeineAccepted: boolean;
  notes: string;
};

type RecentPlan = {
  id: string;
  label: string;
  description: string;
  draft: Partial<BuilderDraft>;
};

const rideTypeOptions: RidePlan["rideType"][] = ["轻松骑", "耐力骑", "拉练", "爬坡", "间歇", "比赛/高强度"];

const templates: Array<{
  id: string;
  name: string;
  description: string;
  draft: Partial<BuilderDraft>;
}> = [
  {
    id: "short",
    name: "90 分钟内短骑",
    description: "轻量补给，适合短时训练或通勤拉腿。",
    draft: { expectedDurationMin: "90", distanceKm: "35", elevationM: "200", rideType: "轻松骑", temperatureC: "20" },
  },
  {
    id: "endurance",
    name: "2-3 小时耐力骑",
    description: "周末常用版本，偏稳定输出。",
    draft: { expectedDurationMin: "180", distanceKm: "75", elevationM: "650", rideType: "耐力骑", temperatureC: "22" },
  },
  {
    id: "climb",
    name: "爬坡训练",
    description: "前段别空，补给开始时间提前。",
    draft: { expectedDurationMin: "150", distanceKm: "55", elevationM: "1200", rideType: "爬坡", temperatureC: "18" },
  },
  {
    id: "heat",
    name: "高温骑行",
    description: "优先补液和电解质。",
    draft: { expectedDurationMin: "150", distanceKm: "60", elevationM: "450", rideType: "耐力骑", temperatureC: "31", hasResupply: true, isHotHumid: true },
  },
];

function numberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  return Number(value);
}

function buildDraftReasonList(draft: BuilderDraft, plan: ReturnType<typeof buildFuelPlan>) {
  const reasons: string[] = [];

  if (draft.expectedDurationMin.trim()) {
    reasons.push(`本次预计骑行 ${formatDuration(Number(draft.expectedDurationMin))}`);
  } else if (draft.distanceKm.trim()) {
    reasons.push(`按 ${draft.distanceKm} km 距离和当前骑行类型预估时长`);
  }

  if (draft.elevationM.trim() && Number(draft.elevationM) > 0) {
    reasons.push(`累计爬升 ${draft.elevationM} m，会提高体感强度`);
  }

  if (draft.temperatureC.trim()) {
    reasons.push(`当前按 ${draft.temperatureC} ℃ 环境修正补液节奏`);
  }

  reasons.push(`骑行类型为${draft.rideType}，因此按 ${plan.strategyLevel} 方案生成`);

  if (draft.breakfastStatus === "空腹/未正式进食") {
    reasons.push("出发前未正式进食，建议提前启动补给");
  }

  return reasons.slice(0, 4);
}

function computeExecutionTag(draft: BuilderDraft, plan: ReturnType<typeof buildFuelPlan>) {
  const hot = draft.isHotHumid || Number(draft.temperatureC || 0) >= 30;
  const long = plan.estimatedDurationMin >= 180;
  const fasting = draft.breakfastStatus === "空腹/未正式进食";

  if ((hot && long) || (fasting && long)) return "建议保守执行";
  if (hot || fasting) return "正常偏保守";
  return "可正常执行";
}

function computeEnvironmentTag(draft: BuilderDraft) {
  const temperature = Number(draft.temperatureC || 0);
  if (draft.isHotHumid || temperature >= 30) return "高温补液优先";
  if (temperature >= 25) return "偏热环境";
  if (draft.hasResupply) return "沿途可补给";
  return "常规环境";
}

export function RidePlanBuilder({
  initialDraft,
  recentPlans,
}: {
  initialDraft: BuilderDraft;
  recentPlans: RecentPlan[];
}) {
  const [draft, setDraft] = useState(initialDraft);

  const enoughToGenerate = Boolean(draft.expectedDurationMin.trim() || draft.distanceKm.trim());
  const previewPlan = useMemo(() => {
    const plan: RidePlan = {
      id: "preview",
      userId: "preview",
      distanceKm: Number(draft.distanceKm || 0),
      elevationM: Number(draft.elevationM || 0),
      expectedSpeedKmh: numberOrUndefined(draft.expectedSpeedKmh),
      expectedDurationMin: numberOrUndefined(draft.expectedDurationMin),
      rideType: draft.rideType,
      temperatureC: numberOrUndefined(draft.temperatureC),
      isHotHumid: draft.isHotHumid,
      hasResupply: draft.hasResupply,
      weightKg: numberOrUndefined(draft.weightKg),
      breakfastStatus: draft.breakfastStatus,
      fuelPreference: draft.fuelPreference,
      caffeineAccepted: draft.caffeineAccepted,
      notes: draft.notes,
      createdAt: new Date().toISOString(),
    };

    return buildFuelPlan(plan);
  }, [draft]);

  const reasons = useMemo(() => buildDraftReasonList(draft, previewPlan), [draft, previewPlan]);
  const executionTag = computeExecutionTag(draft, previewPlan);
  const environmentTag = computeEnvironmentTag(draft);

  function patchDraft<K extends keyof BuilderDraft>(key: K, value: BuilderDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyDraftPatch(patch: Partial<BuilderDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  return (
    <main className="stack ride-plan-builder">
      <section className="panel ride-plan-hero">
        <div className="ride-plan-hero-copy">
          <div className="eyebrow">Pre-Ride Desk</div>
          <h1>骑前补给计划</h1>
          <p className="muted">首屏先告诉你今天该怎么骑、怎么带、怎么吃。输入一变，右侧方案就跟着变。</p>
        </div>
        <div className="ride-plan-status-row">
          <div className="ride-plan-status-card">
            <span className="eyebrow">今日建议</span>
            <strong>{executionTag}</strong>
            <p>{previewPlan.summary}</p>
          </div>
          <div className="ride-plan-status-card">
            <span className="eyebrow">补给复杂度</span>
            <strong>{previewPlan.strategyLevel}</strong>
            <p>{previewPlan.loadLevel}负荷，建议 {previewPlan.carbTargetGPerH} g/h 碳水。</p>
          </div>
          <div className="ride-plan-status-card">
            <span className="eyebrow">环境提示</span>
            <strong>{environmentTag}</strong>
            <p>{draft.hasResupply ? "沿途可补货，可减少首次携带压力。" : "默认按一次出发带齐处理。"}</p>
          </div>
        </div>
      </section>

      <section className="ride-plan-layout">
        <section className="stack">
          <form action="/api/ride-plans" method="post" className="stack">
            <div className="panel">
              <div className="section-title">
                <h2>核心条件</h2>
                <span className={`pill ${enoughToGenerate ? "pill-ok" : ""}`}>{enoughToGenerate ? "已可生成基础方案" : "至少填写时长或距离"}</span>
              </div>
              <p className="muted">核心条件只保留最关键字段。没填的部分会按默认规则推断。</p>
              <div className="form-grid">
                <label>
                  预计时长（分钟）
                  <input type="number" name="expectedDurationMin" min="30" step="5" value={draft.expectedDurationMin} onChange={(event) => patchDraft("expectedDurationMin", event.target.value)} />
                </label>
                <label>
                  预计距离（km）
                  <input type="number" name="distanceKm" min="1" step="1" value={draft.distanceKm} onChange={(event) => patchDraft("distanceKm", event.target.value)} />
                </label>
                <label>
                  累计爬升（m）
                  <input type="number" name="elevationM" min="0" step="10" value={draft.elevationM} onChange={(event) => patchDraft("elevationM", event.target.value)} />
                </label>
                <label>
                  预计均速（km/h）
                  <input type="number" name="expectedSpeedKmh" min="10" step="0.1" value={draft.expectedSpeedKmh} onChange={(event) => patchDraft("expectedSpeedKmh", event.target.value)} />
                </label>
                <label>
                  骑行类型
                  <select name="rideType" value={draft.rideType} onChange={(event) => patchDraft("rideType", event.target.value as RidePlan["rideType"])}>
                    {rideTypeOptions.map((rideType) => (
                      <option key={rideType} value={rideType}>
                        {rideType}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  温度（℃）
                  <input type="number" name="temperatureC" min="-10" max="45" step="1" value={draft.temperatureC} onChange={(event) => patchDraft("temperatureC", event.target.value)} />
                </label>
              </div>
            </div>

            <div className="panel">
              <div className="section-title">
                <h2>个人偏好</h2>
                <span className="pill">默认带入个人档案</span>
              </div>
              <div className="form-grid">
                <label>
                  体重（kg）
                  <input type="number" name="weightKg" min="35" max="120" step="0.1" value={draft.weightKg} onChange={(event) => patchDraft("weightKg", event.target.value)} />
                </label>
                <label>
                  补给偏好
                  <select name="fuelPreference" value={draft.fuelPreference} onChange={(event) => patchDraft("fuelPreference", event.target.value as RidePlan["fuelPreference"])}>
                    <option value="只吃胶">只吃胶</option>
                    <option value="胶+能量棒">胶+能量棒</option>
                    <option value="可便利店补给">可便利店补给</option>
                  </select>
                </label>
                <label>
                  出发前状态
                  <select name="breakfastStatus" value={draft.breakfastStatus} onChange={(event) => patchDraft("breakfastStatus", event.target.value as RidePlan["breakfastStatus"])}>
                    <option value="已进食">已进食</option>
                    <option value="空腹/未正式进食">空腹 / 未正式进食</option>
                  </select>
                </label>
                <label>
                  可接受咖啡因
                  <select name="caffeineAccepted" value={draft.caffeineAccepted ? "true" : "false"} onChange={(event) => patchDraft("caffeineAccepted", event.target.value === "true")}>
                    <option value="true">是</option>
                    <option value="false">否</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="panel">
              <div className="section-title">
                <h2>更多条件</h2>
                <span className="pill">用于风险修正</span>
              </div>
              <div className="form-grid">
                <label>
                  是否炎热 / 高湿
                  <select name="isHotHumid" value={draft.isHotHumid ? "true" : "false"} onChange={(event) => patchDraft("isHotHumid", event.target.value === "true")}>
                    <option value="false">否</option>
                    <option value="true">是</option>
                  </select>
                </label>
                <label>
                  是否有沿途补给点
                  <select name="hasResupply" value={draft.hasResupply ? "true" : "false"} onChange={(event) => patchDraft("hasResupply", event.target.value === "true")}>
                    <option value="false">否</option>
                    <option value="true">是</option>
                  </select>
                </label>
              </div>
              <label>
                备注
                <textarea
                  name="notes"
                  placeholder="例如：今天不想带太多补给，沿途可便利店补货。"
                  value={draft.notes}
                  onChange={(event) => patchDraft("notes", event.target.value)}
                />
              </label>
              <div className="ride-plan-form-footer">
                <p className="muted">
                  {enoughToGenerate ? "当前信息已足够生成基础方案。补充环境和出发前状态后，建议会更准确。" : "请至少填写预计时长或预计距离。"}
                </p>
                <button type="submit" className="primary" disabled={!enoughToGenerate}>
                  生成骑前方案
                </button>
              </div>
            </div>
          </form>

          <div className="panel">
            <div className="section-title">
              <h2>快捷模板</h2>
              <span className="pill">一键带入常见场景</span>
            </div>
            <div className="ride-plan-template-grid">
              {templates.map((template) => (
                <button key={template.id} type="button" className="ride-plan-template-card" onClick={() => applyDraftPatch(template.draft)}>
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="section-title">
              <h2>最近方案</h2>
              <span className="pill">复用后微调更快</span>
            </div>
            {recentPlans.length ? (
              <div className="ride-plan-recent-list">
                {recentPlans.map((plan) => (
                  <div key={plan.id} className="ride-plan-recent-item">
                    <div>
                      <strong>{plan.label}</strong>
                      <p className="muted">{plan.description}</p>
                    </div>
                    <div className="ride-plan-recent-actions">
                      <button type="button" onClick={() => applyDraftPatch(plan.draft)}>
                        复用参数
                      </button>
                      <Link href={`/ride-plans/${plan.id}`}>查看结果</Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">还没有历史计划。你生成第一份后，这里会变成最快的复用入口。</p>
            )}
          </div>
        </section>

        <aside className="stack">
          <div className="panel ride-plan-preview">
            <div className="section-title">
              <h2>本次计划结论</h2>
              <span className="pill">{previewPlan.strategyLevel}</span>
            </div>
            <p className="ride-plan-summary">{previewPlan.summary}</p>
            <div className="ride-plan-metrics">
              <div className="stat">
                <div className="eyebrow">预计时长</div>
                <div className="stat-value">{formatDuration(previewPlan.estimatedDurationMin)}</div>
              </div>
              <div className="stat">
                <div className="eyebrow">碳水目标</div>
                <div className="stat-value">{previewPlan.carbTargetGPerH} g/h</div>
              </div>
              <div className="stat">
                <div className="eyebrow">饮水目标</div>
                <div className="stat-value">{previewPlan.fluidTargetMlPerH} ml/h</div>
              </div>
              <div className="stat">
                <div className="eyebrow">电解质</div>
                <div className="stat-value">{previewPlan.sodiumTargetMgPerH} mg/h</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="section-title">
              <h2>建议携带</h2>
              <CopyButton text={previewPlan.carryingList.join("\n")} />
            </div>
            <ul className="list">
              {previewPlan.carryingList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h2>补给节奏</h2>
            <div className="timeline">
              {previewPlan.timeline.map((item) => (
                <div key={item} className="timeline-item">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>风险提醒</h2>
            <ul className="list">
              {previewPlan.riskFlags.length ? previewPlan.riskFlags.map((item) => <li key={item}>{item}</li>) : <li>暂无明显高风险点，建议仍按节奏提前补给。</li>}
              {draft.breakfastStatus === "空腹/未正式进食" ? <li>出发前未正式进食，建议降低前 45 分钟强度并提前第一口补给。</li> : null}
            </ul>
          </div>

          <div className="panel">
            <h2>这样建议的原因</h2>
            <ul className="list">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
