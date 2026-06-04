import { redirectIfSetupDone } from "@/lib/guards";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await redirectIfSetupDone();
  const { error } = await searchParams;

  return (
    <main className="content-grid">
      <section className="panel">
        <h1>初始化系统</h1>
        <p className="muted">
          首次启动需要先创建管理员。初始化完成后，管理员可以决定是否开放注册，或者只由自己创建账号。
        </p>
        {error ? <p className="error-banner">{decodeURIComponent(error)}</p> : null}
        <form action="/api/setup" method="post">
          <div className="form-grid">
            <label>
              管理员姓名
              <input type="text" name="name" required />
            </label>
            <label>
              管理员邮箱
              <input type="email" name="email" required />
            </label>
            <label>
              密码
              <input type="password" name="password" minLength={8} required />
            </label>
            <label>
              确认密码
              <input type="password" name="confirmPassword" minLength={8} required />
            </label>
          </div>
          <button type="submit" className="primary">
            创建管理员并进入系统
          </button>
        </form>
      </section>
      <aside className="panel">
        <h2>登录策略建议</h2>
        <ul className="list">
          <li>默认建议先用“仅管理员发号”，避免公测前被乱注册。</li>
          <li>内测阶段你可以在管理端手动给 10 个用户发账号。</li>
          <li>如果后续要放量，再切到开放注册。</li>
        </ul>
      </aside>
    </main>
  );
}
