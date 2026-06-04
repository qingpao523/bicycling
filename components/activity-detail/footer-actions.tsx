import Link from "next/link";

type Props = {
  activityId: string;
  hasStrava: boolean;
};

export function ActivityFooterActions({ activityId, hasStrava }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        padding: "20px 0 8px",
        justifyContent: "flex-end",
      }}
    >
      <Link href="/activities" className="button">
        返回训练历史
      </Link>
      {hasStrava ? (
        <form action={`/api/activities/${activityId}/ai-report`} method="post">
          <button type="submit" className="button">
            重新生成 AI 报告
          </button>
        </form>
      ) : null}
      <Link href="/dashboard" className="button">
        返回仪表盘
      </Link>
    </div>
  );
}
