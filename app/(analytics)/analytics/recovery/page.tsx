import { requireUser } from "@/lib/auth";
import { loadAnalyticsData } from "@/lib/analytics-data";
import { calculatePmc } from "@/lib/engine/pmc";
import { calculateRecoveryScores, predictRecovery } from "@/lib/engine/recovery-engine";
import { RecoveryChart } from "@/components/analytics/recovery-chart";

export default async function RecoveryPage() {
  const user = await requireUser();
  const { activities } = await loadAnalyticsData(user);
  const pmcData = calculatePmc(activities);
  const scores = calculateRecoveryScores(pmcData, activities, 14);
  const prediction = predictRecovery(scores);
  const latest = scores.length ? scores[scores.length - 1] : null;

  return (
    <div>
      <div className="analytics-page-header">
        <h1>状态恢复</h1>
        <p>追踪恢复状态，在最佳时机安排高强度训练</p>
      </div>

      {!scores.length ? (
        <div className="analytics-empty">
          <h3>数据不足</h3>
          <p>需要至少 7 天的活动数据才能计算恢复评分。</p>
        </div>
      ) : (
        <>
          <div className="analytics-grid">
            <div className="analytics-stat-card">
              <div className="eyebrow">当前恢复评分</div>
              <div className="stat-value" style={{ color: latest?.color }}>{latest?.score ?? "--"}</div>
              <div className="stat-change" style={{ color: latest?.color }}>{latest?.label}</div>
            </div>
            <div className="analytics-stat-card">
              <div className="eyebrow">预计完全恢复</div>
              <div className="stat-value">
                {prediction.daysToFull === 0 ? "已恢复" : prediction.daysToFull !== null ? `${prediction.daysToFull} 天` : ">30 天"}
              </div>
              <div className="stat-change stat-change--flat">
                日均恢复速率: {prediction.currentRate > 0 ? `+${prediction.currentRate}` : prediction.currentRate} 分/天
              </div>
            </div>
            <div className="analytics-stat-card">
              <div className="eyebrow">恢复建议</div>
              <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginTop: 8 }}>
                {latest && latest.score < 40
                  ? "建议休息或仅进行恢复骑（IF < 0.75）"
                  : latest && latest.score < 60
                  ? "可进行轻松骑，避免高强度"
                  : latest && latest.score < 80
                  ? "状态良好，可正常训练"
                  : "完全恢复，可安排高强度训练"}
              </div>
            </div>
          </div>

          <div className="analytics-card">
            <div className="analytics-card-header">
              <h2>恢复趋势（近 14 天）</h2>
            </div>
            <RecoveryChart scores={scores} />
          </div>

          {latest && (
            <div className="analytics-card">
              <div className="analytics-card-header">
                <h2>影响因素分解</h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                <div>
                  <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 4 }}>TSB 贡献</div>
                  <div style={{ height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${latest.factors.tsbContribution}%`, background: "#1f57d6", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>{latest.factors.tsbContribution}%</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 4 }}>休息间隔</div>
                  <div style={{ height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${latest.factors.restContribution}%`, background: "#0f8a62", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>{latest.factors.restContribution}%</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 4 }}>连续训练天数</div>
                  <div style={{ height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${latest.factors.consecutiveDaysContribution}%`, background: "#f59e0b", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>{latest.factors.consecutiveDaysContribution}%</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 4 }}>近期强度</div>
                  <div style={{ height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${latest.factors.intensityContribution}%`, background: "#c44d3b", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>{latest.factors.intensityContribution}%</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
