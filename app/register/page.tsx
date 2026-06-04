import { requireAuthModeForRegister, requireSetupReady } from "@/lib/guards";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSetupReady();
  await requireAuthModeForRegister();
  const { error } = await searchParams;

  return (
    <main className="content-grid">
      <section className="panel">
        <h1>用户注册</h1>
        {error ? <p className="error-banner">{decodeURIComponent(error)}</p> : null}
        <form action="/api/auth/register" method="post">
          <div className="form-grid">
            <label>
              姓名
              <input type="text" name="name" required />
            </label>
            <label>
              邮箱
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
            注册并登录
          </button>
        </form>
      </section>
      <aside className="panel">
        <h2>说明</h2>
        <ul className="list">
          <li>开放注册只负责创建本地账号。</li>
          <li>intervals.icu API key 仍由用户自己在设置页填。</li>
        </ul>
      </aside>
    </main>
  );
}
