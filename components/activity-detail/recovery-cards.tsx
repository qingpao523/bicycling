import type { RecoveryAdvice, RideReview } from "@/lib/types";

type Props = {
  recovery: RecoveryAdvice;
  review: RideReview;
  enabled: boolean;
};

function compactItems(items: string[], limit = 3) {
  return items.filter(Boolean).slice(0, limit);
}

export function ActivityRecoveryCards({ recovery, review, enabled }: Props) {
  if (!enabled) {
    return <p className="muted">恢复模块已关闭。可在设置中重新启用。</p>;
  }

  const actionCards = [
    { title: "今晚怎么恢复", items: compactItems(recovery.nutrition, 3) },
    { title: "补液 / 电解质", items: compactItems(recovery.hydration, 3) },
    {
      title: "补给复盘",
      items: compactItems(
        recovery.fuelReview.length ? recovery.fuelReview : ["当前还没有足够的实际补给数据，建议先补录骑后补给。"],
        3,
      ),
    },
    { title: "次日训练建议", items: compactItems([recovery.nextDay, ...review.nextAdvice], 3) },
  ];

  return (
    <>
      <div className="analytics-card-header" style={{ marginBottom: 12 }}>
        <h2>恢复与行动建议</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>看完就知道今晚怎么恢复、明天怎么练</span>
      </div>
      <p style={{ margin: "0 0 14px" }}>{recovery.summary}</p>
      <div style={{ display: "grid", gap: 12 }}>
        {actionCards.map((card) => (
          <div key={card.title} className="list-card">
            <h3>{card.title}</h3>
            <ul className="list">
              {card.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
