import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { maskSecret } from "@/lib/format";
import { requireSetupReady } from "@/lib/guards";
import { decryptSecret } from "@/lib/crypto";
import { getAppConfig, listUsers } from "@/lib/storage";
import { ResetPasswordCell } from "@/components/ResetPasswordButton";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireSetupReady();
  await requireAdmin();
  const [{ error, success }, config, users] = await Promise.all([searchParams, getAppConfig(), listUsers()]);
  const aiKey = config.aiApiKeyEncrypted ? decryptSecret(config.aiApiKeyEncrypted) : "";

  return (
    <main className="content-grid">
      <div className="page-back-nav">
        <Link href="/analytics"><ArrowLeft size={16} /> 返回首页</Link>
      </div>
      <section className="stack">
        <div className="panel">
          <h1>管理端</h1>
          <p className="muted">这里负责系统级配置：注册策略、功能开关、AI 提供商，以及给用户发账号。</p>
          {error ? <p className="error-banner">{decodeURIComponent(error)}</p> : null}
          {success ? <p className="success-banner">{decodeURIComponent(success)}</p> : null}
        </div>

        <div className="panel">
          <h2>系统配置</h2>
          <form action="/api/admin/config" method="post">
            <div className="form-grid">
              <label>
                系统名称
                <input type="text" name="appName" defaultValue={config.appName} required />
              </label>
              <label>
                登录模式
                <select name="authMode" defaultValue={config.authMode}>
                  <option value="invite_only">仅管理员发号</option>
                  <option value="open_registration">开放注册</option>
                </select>
              </label>
              <label>
                维护模式
                <select name="maintenanceMode" defaultValue={String(config.maintenanceMode)}>
                  <option value="false">关闭</option>
                  <option value="true">开启</option>
                </select>
              </label>
              <label>
                骑前计划页面
                <select name="featureRidePlans" defaultValue={String(config.featureRidePlans)}>
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </label>
              <label>
                恢复建议页面
                <select name="featureRecovery" defaultValue={String(config.featureRecovery)}>
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </label>
              <label>
                AI 评价页面
                <select name="featureAiReview" defaultValue={String(config.featureAiReview)}>
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </label>
              <label>
                intervals 同步
                <select name="featureIntervalsSync" defaultValue={String(config.featureIntervalsSync)}>
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </label>
              <label>
                AI 开关
                <select name="aiEnabled" defaultValue={String(config.aiEnabled)}>
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </label>
              <label>
                AI 接口地址
                <input type="text" name="aiBaseUrl" defaultValue={config.aiBaseUrl ?? ""} />
              </label>
              <label>
                AI 模型
                <input type="text" name="aiModel" defaultValue={config.aiModel ?? ""} />
              </label>
              <label>
                AI API key
                <input type="password" name="aiApiKey" defaultValue={aiKey} placeholder="留空则保留原值" />
              </label>
              <label>
                自动同步
                <select name="autoSyncEnabled" defaultValue={String(config.autoSyncEnabled)}>
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </label>
              <label>
                自动同步间隔（小时）
                <input type="number" min="1" max="24" step="1" name="autoSyncIntervalHours" defaultValue={config.autoSyncIntervalHours} />
              </label>
              <label>
                自动同步 ICU
                <select name="autoSyncIntervals" defaultValue={String(config.autoSyncIntervals)}>
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </label>
              <label>
                自动同步 Strava
                <select name="autoSyncStrava" defaultValue={String(config.autoSyncStrava)}>
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </label>
            </div>
            <div className="panel dashboard-admin-note" style={{ marginTop: 18 }}>
              <div className="section-title">
                <h3>版本管理</h3>
                <span className="pill">手动维护</span>
              </div>
              <p className="muted">开发版本用于内部迭代标记，线上版本用于正式发布标记。版本号默认由你在管理端手动维护。</p>
              <div className="form-grid">
                <label>
                  开发版本号
                  <input
                    type="text"
                    name="developmentVersion"
                    defaultValue={config.developmentVersion}
                    required
                    placeholder="例如 0.1.1-dev.1"
                  />
                </label>
                <label>
                  线上版本号
                  <input
                    type="text"
                    name="productionVersion"
                    defaultValue={config.productionVersion}
                    required
                    placeholder="例如 0.1.0"
                  />
                </label>
                <label>
                  上次发布时间
                  <input
                    type="text"
                    value={config.lastPublishedAt ? new Date(config.lastPublishedAt).toLocaleString("zh-CN") : "尚未发布"}
                    disabled
                  />
                </label>
              </div>
            </div>
            <label>
              维护提示文案
              <textarea name="maintenanceMessage" defaultValue={config.maintenanceMessage ?? ""} />
            </label>
            <label>
              AI 系统提示词
              <textarea name="aiSystemPrompt" defaultValue={config.aiSystemPrompt ?? ""} />
            </label>
            <button type="submit" className="primary">
              保存系统配置
            </button>
          </form>
          <form action="/api/admin/ai/test" method="post" style={{ marginTop: 12 }}>
            <button type="submit">测试已保存 AI 配置连通性</button>
          </form>
        </div>
      </section>

      <aside className="stack">
        <div className="panel">
          <h2>创建用户账号</h2>
          <form action="/api/admin/users" method="post">
            <label>
              姓名
              <input type="text" name="name" required />
            </label>
            <label>
              邮箱
              <input type="email" name="email" required />
            </label>
            <label>
              初始密码
              <input type="password" name="password" minLength={8} required />
            </label>
            <button type="submit" className="primary">
              创建账号
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="section-title">
            <h2>账号管理</h2>
            <span className="pill">{users.length} 个账号</span>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>邮箱</th>
                  <th>角色</th>
                  <th>ICU ID</th>
                  <th>体重</th>
                  <th>FTP</th>
                  <th>阈值心率</th>
                  <th>最大心率</th>
                  <th>静息心率</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>
                      <span className={`table-pill ${user.role}`}>{user.role === "admin" ? "管理员" : "普通用户"}</span>
                    </td>
                    <td>{user.intervalsAthleteId ?? "-"}</td>
                    <td>{user.weightKg ?? "-"}</td>
                    <td>{user.ftp ?? "-"}</td>
                    <td>{user.thresholdHr ?? "-"}</td>
                    <td>{user.maxHr ?? "-"}</td>
                    <td>{user.restingHr ?? "-"}</td>
                    <td>{new Date(user.updatedAt).toLocaleString("zh-CN")}</td>
                    <ResetPasswordCell userId={user.id} userName={user.name} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h2>AI 状态</h2>
          <ul className="list">
            <li>开关：{config.aiEnabled ? "已开启" : "未开启"}</li>
            <li>模型：{config.aiModel || "未配置"}</li>
            <li>Key：{maskSecret(aiKey)}</li>
            <li>自动同步：{config.autoSyncEnabled ? `已开启（每 ${config.autoSyncIntervalHours} 小时）` : "未开启"}</li>
            <li>自动同步源：{[config.autoSyncIntervals ? "ICU" : null, config.autoSyncStrava ? "Strava" : null].filter(Boolean).join(" + ") || "未选择"}</li>
            <li>最近自动同步：{config.autoSyncLastRunAt ? new Date(config.autoSyncLastRunAt).toLocaleString("zh-CN") : "暂无"}</li>
            <li>自动同步状态：{config.autoSyncLastStatus ?? "暂无"}</li>
            <li>开发版本：{config.developmentVersion}</li>
            <li>线上版本：{config.productionVersion}</li>
            <li>上次发布时间：{config.lastPublishedAt ? new Date(config.lastPublishedAt).toLocaleString("zh-CN") : "尚未发布"}</li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
