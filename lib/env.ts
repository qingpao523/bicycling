export const DEFAULT_APP_SECRET = "dev-only-change-me";

export function getAppSecret() {
  return process.env.APP_SECRET || DEFAULT_APP_SECRET;
}

export function ensureProductionEnv() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  if (!process.env.APP_SECRET || process.env.APP_SECRET === DEFAULT_APP_SECRET) {
    throw new Error("生产环境必须配置自定义 APP_SECRET，不能使用默认开发值。");
  }
}

export function getAppPort() {
  return Number(process.env.APP_PORT || process.env.PORT || 3000);
}

export function getManagerPort() {
  return Number(process.env.MANAGER_PORT || 3210);
}
