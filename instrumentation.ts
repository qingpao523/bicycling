export async function register() {
  // 仅在 Node.js server runtime 启动巡检 (不在 edge / 不在 build 时)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoPatrol } = await import("@/lib/auto-patrol");
    startAutoPatrol();
  }
}
