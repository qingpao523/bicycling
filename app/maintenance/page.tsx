import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";
import { getAppConfig } from "@/lib/storage";

export default async function MaintenancePage() {
  const [config, user] = await Promise.all([getAppConfig(), getCurrentUser()]);

  return (
    <main className="content-grid">
      <section className="panel">
        <h1>系统维护中</h1>
        <p className="muted">{config.maintenanceMessage || "系统正在维护，请稍后再试。"}</p>
        <ul className="list">
          <li>当前系统名称：{config.appName}</li>
          <li>维护模式：已开启</li>
          <li>非管理员用户暂时不可访问业务页面</li>
        </ul>
      </section>
      <aside className="panel">
        <h2>可执行操作</h2>
        <div className="stack">
          {user?.role === "admin" ? <Link href="/admin" className="button primary">管理员继续进入管理端</Link> : null}
          {!user ? <Link href="/login" className="button">管理员登录</Link> : null}
        </div>
      </aside>
    </main>
  );
}
