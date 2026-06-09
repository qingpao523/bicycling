"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, ChevronRight, Loader2 } from "lucide-react";

type Step = "name" | "user_type" | "details" | "goal";

interface WizardData {
  name: string;
  userType: string;
  weightKg: string;
  ftp: string;
  maxHr: string;
  primaryDevice: string;
  intervalsApiKey: string;
  goal: string;
}

export function OnboardingWizard({ initialName }: { initialName?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<WizardData>({
    name: initialName || "",
    userType: "",
    weightKg: "",
    ftp: "",
    maxHr: "",
    primaryDevice: "",
    intervalsApiKey: "",
    goal: "",
  });

  const update = (field: keyof WizardData, value: string) =>
    setData((d) => ({ ...d, [field]: value }));

  const submit = async () => {
    setSubmitting(true);
    const payload: Record<string, string | number> = {};
    if (data.name) payload.name = data.name;
    if (data.userType) payload.userType = data.userType;
    if (data.weightKg) payload.weightKg = Number(data.weightKg);
    if (data.ftp) payload.ftp = Number(data.ftp);
    if (data.maxHr) payload.maxHr = Number(data.maxHr);
    if (data.primaryDevice) payload.primaryDevice = data.primaryDevice;
    if (data.intervalsApiKey) payload.intervalsApiKey = data.intervalsApiKey;
    if (data.goal) payload.goal = data.goal;

    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    router.refresh();
  };

  return (
    <div className="onboarding-wizard">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <Bike size={32} />
          <h2>设置你的骑行助手</h2>
        </div>

        {step === "name" && (
          <div className="onboarding-step">
            <label className="onboarding-label">你的名字</label>
            <input
              className="onboarding-input"
              type="text"
              placeholder="输入你的名字"
              value={data.name}
              onChange={(e) => update("name", e.target.value)}
              autoFocus
            />
            <button
              className="onboarding-next"
              disabled={!data.name.trim()}
              onClick={() => setStep("user_type")}
            >
              下一步 <ChevronRight size={16} />
            </button>
          </div>
        )}

        {step === "user_type" && (
          <div className="onboarding-step">
            <label className="onboarding-label">你的训练记录方式</label>
            <div className="onboarding-options">
              {[
                { value: "power", label: "功率计（骑行台 / 码表）" },
                { value: "watch", label: "智能手表（Garmin / Apple Watch）" },
                { value: "basic", label: "暂时不用设备" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  className={`onboarding-option ${data.userType === opt.value ? "onboarding-option--active" : ""}`}
                  onClick={() => {
                    update("userType", opt.value);
                    setStep("details");
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "details" && (
          <div className="onboarding-step">
            <label className="onboarding-label">补充信息（可跳过）</label>
            <div className="onboarding-fields">
              <input
                className="onboarding-input"
                type="number"
                placeholder="体重（kg）"
                value={data.weightKg}
                onChange={(e) => update("weightKg", e.target.value)}
              />
              {data.userType === "power" && (
                <>
                  <input
                    className="onboarding-input"
                    type="number"
                    placeholder="FTP（瓦）"
                    value={data.ftp}
                    onChange={(e) => update("ftp", e.target.value)}
                  />
                  <input
                    className="onboarding-input"
                    type="password"
                    placeholder="intervals.icu API Key（可选）"
                    value={data.intervalsApiKey}
                    onChange={(e) => update("intervalsApiKey", e.target.value)}
                  />
                </>
              )}
              {data.userType === "watch" && (
                <>
                  <input
                    className="onboarding-input"
                    type="number"
                    placeholder="最大心率（bpm）"
                    value={data.maxHr}
                    onChange={(e) => update("maxHr", e.target.value)}
                  />
                  <select
                    className="onboarding-input"
                    value={data.primaryDevice}
                    onChange={(e) => update("primaryDevice", e.target.value)}
                  >
                    <option value="">选择主力设备</option>
                    <option value="garmin">Garmin</option>
                    <option value="apple_watch">Apple Watch</option>
                    <option value="whoop">WHOOP</option>
                    <option value="coros">COROS</option>
                    <option value="other">其他</option>
                  </select>
                </>
              )}
            </div>
            <button className="onboarding-next" onClick={() => setStep("goal")}>
              下一步 <ChevronRight size={16} />
            </button>
          </div>
        )}

        {step === "goal" && (
          <div className="onboarding-step">
            <label className="onboarding-label">你的骑行目标</label>
            <div className="onboarding-options">
              {[
                { value: "race", label: "备赛 / 提升成绩" },
                { value: "fitness", label: "日常健身 / 保持体能" },
                { value: "weight", label: "减脂 / 控制体重" },
                { value: "fun", label: "享受骑行乐趣" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  className={`onboarding-option ${data.goal === opt.value ? "onboarding-option--active" : ""}`}
                  onClick={() => update("goal", opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              className="onboarding-next onboarding-submit"
              disabled={submitting}
              onClick={submit}
            >
              {submitting ? <Loader2 size={16} className="spin" /> : null}
              {submitting ? "正在保存..." : "完成设置"}
            </button>
          </div>
        )}

        <div className="onboarding-progress">
          {(["name", "user_type", "details", "goal"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`onboarding-dot ${
                s === step ? "onboarding-dot--active" : i < ["name", "user_type", "details", "goal"].indexOf(step) ? "onboarding-dot--done" : ""
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
