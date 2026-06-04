import { RefreshCw } from "lucide-react";
import { headers } from "next/headers";

import { CopyButton } from "@/components/copy-button";
import { requireUser } from "@/lib/auth";
import { formatDateTime, maskSecret } from "@/lib/format";
import { requireAppAvailable, requireSetupReady } from "@/lib/guards";

type JsonRecord = Record<string, unknown>;

function asNumber(value: unknown) {
  return typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : undefined;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(asRecord(item))) : [];
}

function hasJsonContent(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function pickNumber(record: JsonRecord | undefined, keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (typeof value === "number") return value;
  }
  return undefined;
}

function pickLatestNonNullNumber(entries: JsonRecord[], keys: string[]) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const value = pickNumber(entries[index], keys);
    if (typeof value === "number") return value;
  }
  return undefined;
}

function parseIntervalsSummary(profileJson: unknown, wellnessJson: unknown) {
  const profile = asRecord(profileJson);
  const wellness = asRecordArray(wellnessJson);
  const sportSettings = asRecordArray(profile?.sportSettings);
  const rideSettings = sportSettings.find((item) => {
    const types = Array.isArray(item.types) ? item.types : [];
    return types.some((type) => ["Ride", "VirtualRide", "MountainBikeRide", "GravelRide", "TrackRide"].includes(String(type)));
  });

  return {
    athleteId: profile?.id ? String(profile.id) : undefined,
    city: typeof profile?.city === "string" ? profile.city : undefined,
    timezone: typeof profile?.timezone === "string" ? profile.timezone : undefined,
    configuredWeightKg: pickNumber(profile, ["icu_weight", "weight"]),
    configuredRestingHr: pickNumber(profile, ["icu_resting_hr", "resting_hr", "rest_hr"]),
    ftp: pickNumber(rideSettings, ["ftp", "indoor_ftp"]),
    thresholdHr: pickNumber(rideSettings, ["lthr"]),
    maxHr: pickNumber(rideSettings, ["max_hr"]),
    latestWellnessDate: typeof wellness.at(-1)?.id === "string" ? String(wellness.at(-1)?.id) : undefined,
    latestWellnessRestingHr: pickLatestNonNullNumber(wellness, ["restingHR"]),
    latestWellnessHrv: pickLatestNonNullNumber(wellness, ["hrv"]),
    latestWellnessSleepScore: pickLatestNonNullNumber(wellness, ["sleepScore"]),
    latestWellnessSleepSecs: pickLatestNonNullNumber(wellness, ["sleepSecs"]),
    latestWellnessVo2max: pickLatestNonNullNumber(wellness, ["vo2max"]),
    latestWellnessWeightKg: pickLatestNonNullNumber(wellness, ["weight"]),
  };
}

function parseStravaSummary(rawAthleteJson: unknown) {
  const athlete = asRecord(rawAthleteJson);
  if (!athlete) {
    return {
      athleteId: undefined,
      city: undefined,
      state: undefined,
      country: undefined,
      sex: undefined,
      weightKg: undefined,
      ftp: undefined,
    };
  }

  return {
    athleteId: athlete.id ? String(athlete.id) : undefined,
    city: typeof athlete.city === "string" ? athlete.city : undefined,
    state: typeof athlete.state === "string" ? athlete.state : undefined,
    country: typeof athlete.country === "string" ? athlete.country : undefined,
    sex: typeof athlete.sex === "string" ? athlete.sex : undefined,
    weightKg: pickNumber(athlete, ["weight"]),
    ftp: pickNumber(athlete, ["ftp"]),
  };
}

function formatSleepHours(seconds?: number) {
  if (typeof seconds !== "number") return "暂无";
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireSetupReady();
  const user = await requireUser();
  await requireAppAvailable();
  const { error, success } = await searchParams;
  const hasRawProfile = hasJsonContent(user.intervalsRawProfileJson);
  const hasRawWellness = hasJsonContent(user.intervalsRawWellnessJson);
  const parsed = parseIntervalsSummary(user.intervalsRawProfileJson, user.intervalsRawWellnessJson);
  const rawProfileText = hasRawProfile ? JSON.stringify(user.intervalsRawProfileJson, null, 2) : "";
  const rawWellnessText = hasRawWellness ? JSON.stringify(user.intervalsRawWellnessJson, null, 2) : "";
  const hasRawStravaAthlete = hasJsonContent(user.stravaRawAthleteJson);
  const parsedStrava = parseStravaSummary(user.stravaRawAthleteJson);
  const rawStravaAthleteText = hasRawStravaAthlete ? JSON.stringify(user.stravaRawAthleteJson, null, 2) : "";
  const hasStrava = Boolean(user.stravaAccessTokenEncrypted);
  const hasPersonalStravaApp = Boolean(user.stravaPersonalClientId && user.stravaPersonalClientSecretEncrypted);
  const stravaExpiry = user.stravaTokenExpiresAt ? new Date(user.stravaTokenExpiresAt) : undefined;
  const stravaExpired = stravaExpiry ? stravaExpiry.getTime() <= Date.now() : false;

  // 动态计算当前系统实际生成的 Strava callback URL (与 lib/strava.ts getStravaRedirectUri 同逻辑),
  // 让用户能 self-diagnose: 看到的就是 Strava app 后台必须配的回调地址
  const hdrs = await headers();
  const stravaCallbackEnv = process.env.STRAVA_REDIRECT_URI?.trim();
  const forwardedProto = hdrs.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = hdrs.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || hdrs.get("host") || "localhost:3000";
  const protocol = forwardedProto || (host.includes("localhost") ? "http" : "https");
  const stravaCallbackComputed = `${protocol}://${host}/api/auth/strava/callback`;
  const stravaCallbackEffective = stravaCallbackEnv || stravaCallbackComputed;
  const stravaCallbackSource = stravaCallbackEnv ? "env STRAVA_REDIRECT_URI" : "请求 host header 动态生成";

  return (
    <main className="settings-shell">
      <section className="panel settings-top-panel">
        <div className="settings-top-copy">
          <h1>个人设置</h1>
          <p className="muted">
            这里是用户自助配置区。每个用户只管理自己的 intervals.icu 身份和 key，不共享给别人。体重、FTP、阈值心率、最大心率、静息心率会在同步 ICU 后自动带出，你也可以再人工修正。
          </p>
          {error ? <p className="error-banner">{decodeURIComponent(error)}</p> : null}
          {success ? <p className="success-banner">{decodeURIComponent(success)}</p> : null}
        </div>
        <div className="settings-top-grid">
          <div className="settings-top-form">
            <form action="/api/settings/profile" method="post">
              <div className="form-grid">
                <label>
                  姓名
                  <input type="text" name="name" defaultValue={user.name} required />
                </label>
                <label>
                  邮箱
                  <input type="email" value={user.email} disabled />
                </label>
                <label>
                  体重（kg）
                  <input type="number" name="weightKg" min="35" max="120" step="0.1" defaultValue={user.weightKg ?? ""} />
                  <span className="muted">ICU 同步值：{user.syncedWeightKg ?? "暂未同步"}</span>
                </label>
                <label>
                  FTP
                  <input type="number" name="ftp" min="80" max="500" step="1" defaultValue={user.ftp ?? ""} />
                  <span className="muted">ICU 同步值：{user.syncedFtp ?? "暂未同步"}</span>
                </label>
                <label>
                  阈值心率
                  <input type="number" name="thresholdHr" min="100" max="220" step="1" defaultValue={user.thresholdHr ?? ""} />
                  <span className="muted">ICU 同步值：{user.syncedThresholdHr ?? "暂未同步"}</span>
                </label>
                <label>
                  最大心率
                  <input type="number" name="maxHr" min="120" max="230" step="1" defaultValue={user.maxHr ?? ""} />
                  <span className="muted">ICU 同步值：{user.syncedMaxHr ?? "暂未同步"}</span>
                </label>
                <label>
                  静息心率
                  <input type="number" name="restingHr" min="30" max="120" step="1" defaultValue={user.restingHr ?? ""} />
                  <span className="muted">ICU 同步值：{user.syncedRestingHr ?? "暂未同步"}</span>
                </label>
                <label>
                  intervals athlete id
                  <input type="text" name="intervalsAthleteId" defaultValue={user.intervalsAthleteId ?? ""} placeholder="留空则用 athlete/0" />
                </label>
                <label className="settings-wide-field">
                  intervals API key
                  <input
                    type="password"
                    name="intervalsApiKey"
                    defaultValue=""
                    placeholder={user.intervalsApiKeyEncrypted ? "已配置，留空不改" : "输入你的 API key"}
                  />
                </label>
              </div>
              <button type="submit" className="primary">
                保存个人设置
              </button>
            </form>
          </div>

          <div className="settings-sync-card">
            <div className="settings-summary">
              <h3>同步数据展示</h3>
              <div className="settings-sync-split">
                <div>
                  <h4>intervals.icu 同步数据展示</h4>
                  <ul className="list">
                    <li>athlete id：{user.intervalsAthleteId || "未配置"}</li>
                    <li>API key：{maskSecret(user.intervalsApiKeyEncrypted ? "configured-key-ready" : "")}</li>
                    <li>体重：{user.weightKg ?? "未配置"}</li>
                    <li>FTP：{user.ftp ?? "未配置"}</li>
                    <li>阈值心率：{user.thresholdHr ?? "未配置"}</li>
                    <li>最大心率：{user.maxHr ?? "未配置"}</li>
                    <li>静息心率：{user.restingHr ?? "未配置"}</li>
                  </ul>
                </div>
                <div>
                  <h4>Strava 同步数据展示</h4>
                  <ul className="list">
                    <li>状态：{hasStrava ? "已连接" : "未连接"}</li>
                    <li>授权来源：{user.stravaAuthSource === "personal" ? "个人应用" : user.stravaAuthSource === "platform" ? "平台应用" : "未配置"}</li>
                    <li>athlete id：{user.stravaAthleteId ?? "未配置"}</li>
                    <li>scope：{user.stravaScopes ?? "未配置"}</li>
                    <li>token 过期：{stravaExpiry ? `${formatDateTime(user.stravaTokenExpiresAt!)}${stravaExpired ? "（已过期）" : ""}` : "未知"}</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="settings-summary settings-inline-action">
              <div className="settings-inline-copy">
                <h3>同步个人信息</h3>
                <p className="muted settings-summary-copy">只同步 ICU / Strava 的个人档案信息，不同步活动数据。</p>
                <p className="muted settings-summary-meta">说明：优先只拉个人信息接口；若源接口限制较强，才会降级到近 30 天范围。</p>
              </div>
              <form action="/api/integrations/profile-sync" method="post">
                <button type="submit" className="button primary">
                  同步个人信息
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-columns">
        <div className="panel">
          <h2>intervals.icu</h2>
          <ul className="list">
            <li>athlete id：{user.intervalsAthleteId || "未配置"}</li>
            <li>API key：{maskSecret(user.intervalsApiKeyEncrypted ? "configured-key-ready" : "")}</li>
            <li>体重：{user.weightKg ?? "未配置"}</li>
            <li>FTP：{user.ftp ?? "未配置"}</li>
            <li>阈值心率：{user.thresholdHr ?? "未配置"}</li>
            <li>最大心率：{user.maxHr ?? "未配置"}</li>
            <li>静息心率：{user.restingHr ?? "未配置"}</li>
            <li>说明：上面显示的是当前生效值；如果你手改过，它会覆盖 ICU 自动同步值。</li>
          </ul>
          <div className="hero-actions">
            <form action="/api/integrations/intervals/sync" method="post">
              <button type="submit" className="button primary">
                <RefreshCw size={16} /> ICU 增量同步
              </button>
            </form>
            <form action="/api/integrations/intervals/sync?mode=full" method="post">
              <button type="submit" className="button">
                ICU 全量回补
              </button>
            </form>
          </div>
          <div className="settings-summary">
            <h3>同步说明</h3>
            <ul className="list">
              <li>API key 由用户自己提供，系统只做加密存储。</li>
              <li>athlete id 留空时按当前 key 所属用户处理。</li>
              <li>现在 ICU 同步默认会做全量历史回补，并自动回填你的 ICU 档案参数。</li>
              <li>为避免首次全量同步过慢，只会预拉最近少量活动的流数据；其余流数据在活动详情页按需补取。</li>
              <li>默认按钮会走增量同步；只有你主动点“全量回补”时，才会重新拉全历史。</li>
            </ul>
          </div>
          {hasRawProfile || hasRawWellness ? (
            <div className="settings-summary">
              <h3>ICU 字段映射</h3>
              <ul className="list">
                <li>athlete id：{parsed.athleteId ?? "暂无"}</li>
                <li>城市 / 时区：{[parsed.city, parsed.timezone].filter(Boolean).join(" / ") || "暂无"}</li>
                <li>当前配置体重：{parsed.configuredWeightKg ?? "暂无"}{typeof parsed.configuredWeightKg === "number" ? " kg" : ""}</li>
                <li>当前配置静息心率：{parsed.configuredRestingHr ?? "暂无"}{typeof parsed.configuredRestingHr === "number" ? " bpm" : ""}</li>
                <li>骑行 FTP：{parsed.ftp ?? "暂无"}</li>
                <li>骑行 LTHR：{parsed.thresholdHr ?? "暂无"}</li>
                <li>骑行最大心率：{parsed.maxHr ?? "暂无"}</li>
                <li>最近 wellness 日期：{parsed.latestWellnessDate ?? "暂无"}</li>
                <li>最近有效静息心率：{parsed.latestWellnessRestingHr ?? "暂无"}{typeof parsed.latestWellnessRestingHr === "number" ? " bpm" : ""}</li>
                <li>最近有效 HRV：{parsed.latestWellnessHrv ?? "暂无"}</li>
                <li>最近有效睡眠评分：{parsed.latestWellnessSleepScore ?? "暂无"}</li>
                <li>最近有效睡眠时长：{formatSleepHours(parsed.latestWellnessSleepSecs)}</li>
                <li>最近有效 VO2max：{parsed.latestWellnessVo2max ?? "暂无"}</li>
                <li>最近有效体重：{parsed.latestWellnessWeightKg ?? "暂无"}{typeof parsed.latestWellnessWeightKg === "number" ? " kg" : ""}</li>
              </ul>
            </div>
          ) : null}
          {hasRawProfile || hasRawWellness ? (
            <details className="settings-raw-details">
              <summary>查看 intervals 原始返回字段</summary>
              {hasRawProfile ? (
                <div className="settings-raw-block">
                  <div className="settings-raw-header">
                    <h3>athlete profile</h3>
                    <CopyButton text={rawProfileText} />
                  </div>
                  <pre>{rawProfileText}</pre>
                </div>
              ) : null}
              {hasRawWellness ? (
                <div className="settings-raw-block">
                  <div className="settings-raw-header">
                    <h3>wellness</h3>
                    <CopyButton text={rawWellnessText} />
                  </div>
                  <pre>{rawWellnessText}</pre>
                </div>
              ) : null}
            </details>
          ) : null}
        </div>

        <div className="panel">
          <h2>Strava</h2>
          <ul className="list">
            <li>状态：{hasStrava ? "已授权，可用于后续 Strava 同步。" : "尚未授权。"}</li>
            <li>授权来源：{user.stravaAuthSource === "personal" ? "个人应用" : user.stravaAuthSource === "platform" ? "平台应用" : "未连接"}</li>
            <li>个人应用 ID：{user.stravaPersonalClientId ?? "未配置"}</li>
            <li>athlete id：{user.stravaAthleteId ?? "未配置"}</li>
            <li>scope：{user.stravaScopes ?? "未配置"}</li>
            <li>token 过期：{stravaExpiry ? `${formatDateTime(user.stravaTokenExpiresAt!)}${stravaExpired ? "（已过期）" : ""}` : "未知"}</li>
            <li style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>当前回调 URL (复制到 Strava 后台)：</span>
              <code style={{ background: "var(--surface-alt, #f8fafc)", padding: "2px 8px", borderRadius: 6, fontSize: "0.82rem", wordBreak: "break-all" }}>
                {stravaCallbackEffective}
              </code>
              <CopyButton text={stravaCallbackEffective} />
              <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>(来源: {stravaCallbackSource})</span>
            </li>
            {stravaCallbackEnv && stravaCallbackEnv !== stravaCallbackComputed ? (
              <li style={{ color: "#c44d3b", fontSize: "0.85rem" }}>
                ⚠ STRAVA_REDIRECT_URI 与当前域名不一致 — 动态生成是 <code>{stravaCallbackComputed}</code>, 若已迁移域名请同步更新 .env 或服务器 host
              </li>
            ) : null}
            <li>建议 scope：read,activity:read_all</li>
            <li>同步前会先按开始时间、距离、时长做疑似重复过滤，尽量避免和 intervals 数据重复入库。</li>
          </ul>
          <div className="settings-summary">
            <h3>官方 Strava 授权</h3>
            <p className="muted settings-summary-copy">默认推荐。适合大多数用户，直接使用平台应用完成授权。</p>
            <div className="hero-actions">
              <a href="/api/auth/strava" className="button primary">
                {hasStrava ? "重连官方 Strava" : "连接官方 Strava"}
              </a>
            </div>
            <p className="muted settings-summary-copy">下面的增量同步 / 全量回补 / 断开操作都会按当前已连接来源执行。</p>
            <div className="hero-actions">
              {hasStrava ? (
                <form action="/api/integrations/strava/sync" method="post">
                  <button type="submit" className="button">
                    Strava 增量同步
                  </button>
                </form>
              ) : null}
              {hasStrava ? (
                <form action="/api/integrations/strava/sync?mode=full" method="post">
                  <button type="submit" className="button">
                    Strava 全量回补
                  </button>
                </form>
              ) : null}
              {hasStrava ? (
                <form action="/api/auth/strava/disconnect" method="post">
                  <button type="submit" className="button">
                    断开 Strava
                  </button>
                </form>
              ) : null}
            </div>
          </div>
          <form action="/api/settings/strava-app" method="post" className="settings-summary settings-summary-form">
            <h3>Strava 个人应用备用授权</h3>
            <p className="muted settings-summary-copy">当官方应用名额受限时可用。先保存你自己的应用 ID / Key，再发起个人授权。</p>
            <p className="muted settings-summary-copy">在后台创建个人应用地址：`https://www.strava.com/settings/api`</p>
            <div className="form-grid">
              <label>
                个人应用 ID
                <input type="text" name="stravaPersonalClientId" defaultValue={user.stravaPersonalClientId ?? ""} placeholder="填写你自己的 Strava Client ID" />
              </label>
              <label>
                个人应用 Key
                <input
                  type="password"
                  name="stravaPersonalClientSecret"
                  defaultValue=""
                  placeholder={user.stravaPersonalClientSecretEncrypted ? "已配置，留空不改" : "填写你自己的 Strava Client Secret"}
                />
              </label>
            </div>
            <p className="muted settings-summary-meta">当前状态：{maskSecret(user.stravaPersonalClientSecretEncrypted ? "configured-secret-ready" : "")}</p>
            <div className="hero-actions">
              <button type="submit" className="button">
                保存
              </button>
              <a
                href={hasPersonalStravaApp ? "/api/auth/strava?app=personal" : "/settings?error=" + encodeURIComponent("请先保存完整的个人 Strava 应用 ID / Key。")}
                className={`button ${hasPersonalStravaApp ? "primary" : ""}`}
                aria-disabled={!hasPersonalStravaApp}
              >
                前往个人授权
              </a>
            </div>
          </form>
          <div className="settings-summary">
            <h3>Strava 个人应用使用步骤</h3>
            <ul className="list">
              <li>1. 在 Strava 后台创建你自己的应用，地址：`https://www.strava.com/settings/api`。</li>
              <li>
                2. 将回调地址配置为当前系统回调:{" "}
                <code style={{ background: "var(--surface-alt, #f8fafc)", padding: "2px 6px", borderRadius: 4, fontSize: "0.82rem" }}>
                  {stravaCallbackEffective}
                </code>
                {" "}(直接复制上方"当前回调 URL" 即可)
              </li>
              <li>3. 在这里填写个人应用 ID / Key，点击“保存”。</li>
              <li>4. 点击“前往个人授权”，系统会改为使用你的个人应用发起 OAuth。</li>
              <li>5. 授权成功后，后续手动同步与 token 刷新都会继续走你的个人应用。</li>
              <li>说明：个人应用模式可用于授权、刷新和同步；不会自动继承平台应用的 Webhook 订阅。</li>
            </ul>
          </div>
          {hasRawStravaAthlete ? (
            <div className="settings-summary settings-data-zone">
              <h3>Strava 字段映射</h3>
              <ul className="list">
                <li>athlete id：{parsedStrava.athleteId ?? "暂无"}</li>
                <li>城市 / 地区 / 国家：{[parsedStrava.city, parsedStrava.state, parsedStrava.country].filter(Boolean).join(" / ") || "暂无"}</li>
                <li>性别：{parsedStrava.sex ?? "暂无"}</li>
                <li>映射体重（kg）：{parsedStrava.weightKg ?? "暂无"}</li>
                <li>映射 FTP：{parsedStrava.ftp ?? "暂无"}</li>
                <li>映射阈值心率：Strava athlete 原始接口未提供</li>
                <li>映射最大心率：Strava athlete 原始接口未提供</li>
                <li>映射静息心率：Strava athlete 原始接口未提供</li>
              </ul>
            </div>
          ) : null}
          {hasRawStravaAthlete ? (
            <details className="settings-raw-details settings-data-zone">
              <summary>查看 Strava 原始返回字段</summary>
              <div className="settings-raw-block">
                <div className="settings-raw-header">
                  <h3>athlete profile</h3>
                  <CopyButton text={rawStravaAthleteText} />
                </div>
                <pre>{rawStravaAthleteText}</pre>
              </div>
            </details>
          ) : null}
        </div>
      </section>
    </main>
  );
}
