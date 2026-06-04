import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { cnBool, formatDuration } from "@/lib/format";
import { requireAppAvailable, requireSetupReady } from "@/lib/guards";
import { getAppConfig, getFuelPlanByRidePlanId, getRidePlan } from "@/lib/storage";

export default async function RidePlanResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSetupReady();
  const user = await requireUser();
  await requireAppAvailable();
  const { id } = await params;
  const [config, plan, fuelPlan] = await Promise.all([getAppConfig(), getRidePlan(id), getFuelPlanByRidePlanId(id)]);

  if (!config.featureRidePlans) {
    redirect("/");
  }

  if (!plan || !fuelPlan || plan.userId !== user.id) {
    notFound();
  }

  return (
    <main className="content-grid">
      <section className="stack">
        <div className="panel">
          <div className="section-title">
            <h1>骑前补给建议</h1>
            <span className="pill">{fuelPlan.strategyLevel}策略</span>
          </div>
          <p>{fuelPlan.summary}</p>
          <div className="cards-grid">
            <div className="stat">
              <div className="eyebrow">预计时长</div>
              <div className="stat-value">{formatDuration(fuelPlan.estimatedDurationMin)}</div>
            </div>
            <div className="stat">
              <div className="eyebrow">负荷等级</div>
              <div className="stat-value">{fuelPlan.loadLevel}</div>
            </div>
            <div className="stat">
              <div className="eyebrow">碳水目标</div>
              <div className="stat-value">{fuelPlan.carbTargetGPerH} g/h</div>
            </div>
            <div className="stat">
              <div className="eyebrow">饮水 / 钠</div>
              <div className="stat-value">{fuelPlan.fluidTargetMlPerH} ml/h</div>
              <div className="muted">{fuelPlan.sodiumTargetMgPerH} mg/h</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>建议携带清单</h2>
          <ul className="list">
            {fuelPlan.carryingList.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>补给时间轴</h2>
          <div className="timeline">
            {fuelPlan.timeline.map((item) => (
              <div key={item} className="timeline-item">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="stack">
        <div className="panel">
          <h2>计划输入</h2>
          <ul className="list">
            <li>骑行类型：{plan.rideType}</li>
            <li>距离：{plan.distanceKm} km</li>
            <li>爬升：{plan.elevationM} m</li>
            <li>预计均速：{plan.expectedSpeedKmh ?? "--"} km/h</li>
            <li>用户预计时长：{plan.expectedDurationMin ? formatDuration(plan.expectedDurationMin) : "--"}</li>
            <li>温度：{plan.temperatureC ?? "--"} ℃</li>
            <li>炎热高湿：{cnBool(plan.isHotHumid)}</li>
            <li>沿途补给点：{cnBool(plan.hasResupply)}</li>
            <li>出发前已进食：{plan.breakfastStatus}</li>
          </ul>
        </div>

        <div className="panel">
          <h2>风险提醒</h2>
          <ul className="list">
            {fuelPlan.riskFlags.length ? (
              fuelPlan.riskFlags.map((item) => <li key={item}>{item}</li>)
            ) : (
              <li>暂无明显高风险点，但仍建议按节奏提前补给。</li>
            )}
          </ul>
        </div>

        <Link href="/ride-plans/new" className="button primary">
          再做一份新计划
        </Link>
      </aside>
    </main>
  );
}
