import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listRacePlans } from "@/lib/storage";

export default async function RacePlanListPage() {
  const user = await requireUser();
  const plans = await listRacePlans(user.id);

  return (
    <div className="race-plan-page">
      <div className="race-plan-header">
        <h2>辣堡自助计划</h2>
        <Link href="/race-plan/new" className="btn-primary">
          新建计划
        </Link>
      </div>
      <p className="race-plan-subtitle">上传路线 + 录入队友/对手数据 → AI 帮你制定拉爆战术</p>

      {plans.length === 0 ? (
        <div className="race-plan-empty">
          <p>还没有比赛计划</p>
          <p>点击"新建计划"开始你的第一份战术方案</p>
        </div>
      ) : (
        <div className="race-plan-list">
          {plans.map((plan) => {
            const route = JSON.parse(plan.routeJson) as { totalDistanceKm: number; totalElevationM: number };
            const teammateCount = plan.riders.filter((r) => r.role === "teammate").length;
            const opponentCount = plan.riders.filter((r) => r.role === "opponent").length;
            return (
              <Link key={plan.id} href={`/race-plan/${plan.id}`} className="race-plan-card">
                <div className="race-plan-card-title">
                  <span>{plan.name}</span>
                  <span className={`race-plan-status status-${plan.status}`}>
                    {plan.status === "draft" ? "草稿" : plan.status === "generated" ? "已生成" : plan.status}
                  </span>
                </div>
                <div className="race-plan-card-meta">
                  <span>{route.totalDistanceKm} km</span>
                  <span>{route.totalElevationM} m↑</span>
                  <span>{teammateCount} 队友</span>
                  <span>{opponentCount} 对手</span>
                  {plan.raceDate && <span>{plan.raceDate}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
