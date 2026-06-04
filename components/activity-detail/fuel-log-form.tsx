import { PencilLine } from "lucide-react";
import type { FuelLog } from "@/lib/types";

const symptoms = ["饿崩", "抽筋", "头晕", "胃不适", "明显口渴"];

type Props = {
  activityId: string;
  fuelLog?: FuelLog | null;
};

export function ActivityFuelLogForm({ activityId, fuelLog }: Props) {
  const defaultDoubleGelCount = fuelLog?.doubleGelCountActual ?? fuelLog?.gelCountActual ?? 0;
  const defaultCaffeineGelCount = fuelLog?.caffeineGelCountActual ?? 0;
  const defaultSaltCapsuleCount = fuelLog?.saltCapsuleCountActual ?? 0;
  const estimatedCarbs = defaultDoubleGelCount * 45 + defaultCaffeineGelCount * 30;
  const symptomValues = new Set(fuelLog?.symptoms ?? []);

  return (
    <>
      <div className="analytics-card-header" style={{ marginBottom: 12 }}>
        <h2>骑中补给与疲劳记录</h2>
        <span className={`status-dot ${fuelLog ? "ok" : "warn"}`}>{fuelLog ? "已记录" : "待填写"}</span>
      </div>
      <p style={{ color: "var(--muted)", margin: "0 0 12px", fontSize: "0.88rem" }}>
        补给记录会直接修正恢复判断、疲劳信号和次日建议。
      </p>
      {!fuelLog ? (
        <div className="activity-log-callout" style={{ marginBottom: 12 }}>
          <span className="pill">待录入补给</span>
          <p className="muted">当前还没有骑中补给记录，建议补录后再看恢复判断和次日建议。</p>
        </div>
      ) : null}

      <form action={`/api/activities/${activityId}/fuel-log`} method="post" className="activity-fuel-form">
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
    </>
  );
}
