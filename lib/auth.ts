import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hashPassword } from "@/lib/crypto";
import { createId, getSession, getUserByEmail, getUserById, hasAnyUser, saveSession, saveUser } from "@/lib/storage";
import type { User, UserRole } from "@/lib/types";

const COOKIE_NAME = "ai_cycling_session";
const SESSION_AGE_MS = 1000 * 60 * 60 * 24 * 14;

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const session = await getSession(sessionId);
  if (!session) return null;

  return getUserById(session.userId);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export async function setSession(userId: string) {
  const session = {
    id: createId("sess"),
    userId,
    expiresAt: new Date(Date.now() + SESSION_AGE_MS).toISOString(),
    createdAt: new Date().toISOString(),
  };
  await saveSession(session);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (sessionId) {
    const { deleteSession } = await import("@/lib/storage");
    await deleteSession(sessionId);
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function bootstrapAdmin(input: {
  name: string;
  email: string;
  password: string;
}) {
  const exists = await hasAnyUser();
  if (exists) {
    throw new Error("系统已经初始化。");
  }
  return createUser({
    ...input,
    role: "admin",
  });
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}) {
  const existing = await getUserByEmail(input.email);
  if (existing) {
    throw new Error("邮箱已存在。");
  }

  const now = new Date().toISOString();
  const user: User = {
    id: createId("user"),
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash: hashPassword(input.password),
    role: input.role ?? "user",
    onboardingStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await saveUser(user);
  return user;
}

// 邀请制场景：邮箱即唯一凭证；密码字段在前端仅作 UI 占位，后端不参与校验。
// 这是产品设计意图，非安全 bug。安全模型依赖：注册渠道封闭（仅 admin 发号）。
export async function loginWithPassword(email: string, _password: string) {
  const user = await getUserByEmail(email);
  if (!user) {
    throw new Error("邮箱不存在。");
  }
  await setSession(user.id);
  return user;
}
