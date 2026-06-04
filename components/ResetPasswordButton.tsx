"use client";

import { useState } from "react";

export function ResetPasswordCell({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <td>
        <button type="button" className="ghost" onClick={() => setOpen(true)} style={{ fontSize: "0.85rem", padding: "2px 8px" }}>
          重置密码
        </button>
      </td>
    );
  }

  return (
    <td>
      <form
        action={`/api/admin/users/${userId}/reset-password`}
        method="post"
        style={{ display: "flex", gap: 4, alignItems: "center" }}
        onSubmit={() => setOpen(false)}
      >
        <input
          type="password"
          name="password"
          minLength={8}
          required
          placeholder="新密码"
          autoFocus
          style={{ width: 100, fontSize: "0.85rem", padding: "2px 6px" }}
        />
        <button type="submit" className="primary" style={{ fontSize: "0.8rem", padding: "2px 8px" }}>
          确认
        </button>
        <button type="button" className="ghost" onClick={() => setOpen(false)} style={{ fontSize: "0.8rem", padding: "2px 8px" }}>
          取消
        </button>
      </form>
    </td>
  );
}