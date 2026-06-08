"use client";

interface TacticsPlan {
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

export function TacticsView({ tacticsJson }: { tacticsJson: string }) {
  let tactics: TacticsPlan;
  try {
    tactics = JSON.parse(tacticsJson);
  } catch {
    return <p className="text-muted">战术数据格式错误</p>;
  }

  return (
    <div className="tactics-view">
      <section className="tactics-overview">
        <h3>总体策略</h3>
        <p>{tactics.overview}</p>
      </section>

      {tactics.segments.length > 0 && (
        <section className="tactics-segments">
          <h3>分段战术</h3>
          {tactics.segments.map((seg, i) => (
            <div key={i} className="tactics-segment-card">
              <div className="tactics-segment-header">{seg.description}</div>
              <div className="tactics-segment-details">
                <span>节奏: {seg.pace}</span>
                <span>队形: {seg.formation}</span>
                <span>目标: {seg.goal}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {tactics.keyMoments.length > 0 && (
        <section className="tactics-key-moments">
          <h3>关键时刻</h3>
          {tactics.keyMoments.map((km, i) => (
            <div key={i} className="tactics-moment-card">
              <div className="moment-km">{km.atKm.toFixed(1)} km</div>
              <div className="moment-details">
                <strong>{km.action}</strong> — {km.who}
                <p>{km.why}</p>
                {km.targetPower && <span className="moment-power">{km.targetPower}</span>}
              </div>
            </div>
          ))}
        </section>
      )}

      {tactics.riskFactors.length > 0 && (
        <section className="tactics-risks">
          <h3>风险提示</h3>
          <ul>
            {tactics.riskFactors.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
