"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

export function UserMenu({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button className="user-menu-trigger" onClick={() => setOpen(!open)}>
        {name} <span style={{ opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <Link href="/settings" onClick={() => setOpen(false)}>设置</Link>
          {role === "admin" && (
            <Link href="/admin" onClick={() => setOpen(false)}>管理端</Link>
          )}
          <div className="user-menu-divider" />
          <form action="/api/auth/logout" method="post">
            <button type="submit">退出登录</button>
          </form>
        </div>
      )}
    </div>
  );
}
