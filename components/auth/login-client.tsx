"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [authMode, setAuthMode] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => setAuthMode(d.authMode))
      .catch(() => setAuthMode("invite_only"));
  }, []);

  return (
    <main className="content-grid">
      <section className="panel">
        <h1>登录</h1>
        <p className="muted">用系统账号登录。普通用户不再看到任何模拟数据，只看自己的真实同步结果。</p>
        {error ? <p className="error-banner">{decodeURIComponent(error)}</p> : null}
        <form action="/api/auth/login" method="post">
          <label>
            邮箱
            <input type="email" name="email" required />
          </label>
          <label>
            密码
            <input type="password" name="password" placeholder="留空可仅凭邮箱登录" />
          </label>
          <button type="submit" className="primary">
            登录
          </button>
        </form>
      </section>
      {authMode !== null && (
        <aside className="panel">
          <h2>当前注册策略</h2>
          <ul className="list">
            <li>{authMode === "open_registration" ? "开放注册" : "仅管理员发号"}</li>
            <li>管理员可在管理端切换策略。</li>
          </ul>
          {authMode === "open_registration" ? (
            <Link href="/register" className="button">
              去注册
            </Link>
          ) : (
            <div className="stack">
              <span className="button button-disabled" aria-disabled="true">
                注册已关闭
              </span>
              <p className="muted">当前不允许自行注册，请联系管理员创建账号。</p>
            </div>
          )}
        </aside>
      )}
    </main>
  );
}

export function LoginClient() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
