export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDuration(min: number) {
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  if (!hours) return `${minutes} 分钟`;
  return `${hours} 小时 ${minutes} 分钟`;
}

export function cnBool(value: boolean) {
  return value ? "是" : "否";
}

export function maskSecret(value?: string) {
  if (!value) return "未配置";
  if (value.length <= 6) return "已配置";
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}
