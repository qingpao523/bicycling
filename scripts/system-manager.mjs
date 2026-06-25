import { createServer } from "node:http";
import { accessSync, constants as fsConstants, existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream, unlinkSync, cpSync, rmSync, symlinkSync, readdirSync } from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_CLOUDFLARED_METRICS,
  buildCloudflaredArgs,
  buildCloudflaredEnv,
  chooseWritableLogPath,
  isProcessRunning,
  parseCloudflaredPids,
  parseHaConnections,
  persistPidIfWritable,
  removePidFileIfPossible,
} from "./cloudflared-supervisor.mjs";
import { writeJson, writeJsonError } from "./system-manager-http.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const releaseRootDir = path.join(projectDir, ".runtime");
const productionDir = path.join(releaseRootDir, "production-current");
const runtimeDir = path.join(projectDir, "data", "manager");
const statePath = path.join(runtimeDir, "state.json");
const productionPidPath = path.join(runtimeDir, "app.pid");
const developmentPidPath = path.join(runtimeDir, "dev-app.pid");
const ngrokPidPath = path.join(runtimeDir, "ngrok.pid");
const cloudflaredPidPath = path.join(runtimeDir, "cloudflared.pid");
const cloudflaredProxyPidPath = path.join(runtimeDir, "cloudflared-proxy.pid");
const cloudflaredTokenPath = path.join(runtimeDir, "cloudflared-token.txt");
const cloudflaredLogPath = path.join(runtimeDir, "cloudflared.log");
const cloudflaredErrPath = path.join(runtimeDir, "cloudflared-err.log");
const legacyCloudflaredErrPath = path.join(runtimeDir, "cloudflared.err");
const cloudflaredManagerLogPath = path.join(runtimeDir, "cloudflared-manager.log");
const cloudflaredManagerErrPath = path.join(runtimeDir, "cloudflared-manager-err.log");
const productionStdoutPath = path.join(runtimeDir, "app.stdout.log");
const productionStderrPath = path.join(runtimeDir, "app.stderr.log");
const developmentStdoutPath = path.join(runtimeDir, "dev-app.stdout.log");
const developmentStderrPath = path.join(runtimeDir, "dev-app.stderr.log");
const ngrokLogPath = path.join(runtimeDir, "ngrok.log");
const envFilePath = path.join(projectDir, ".env.production.local");
const launchAgentLabel = "com.flyaways.ai-cycling-manager";
const launchAgentDir = path.join(process.env.HOME || "", "Library", "LaunchAgents");
const launchAgentPath = path.join(launchAgentDir, `${launchAgentLabel}.plist`);
const managerLogPath = path.join(runtimeDir, "manual-manager.log");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, "utf8");
  const entries = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const idx = line.indexOf("=");
      if (idx < 0) return null;
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
    .filter(Boolean);
  return Object.fromEntries(entries);
}

const fileEnv = loadEnvFile(envFilePath);
const managerPort = Number(process.env.MANAGER_PORT || fileEnv.MANAGER_PORT || 3210);
const appPort = Number(process.env.APP_PORT || fileEnv.APP_PORT || 3000);
const developmentPort = Number(process.env.DEV_APP_PORT || fileEnv.DEV_APP_PORT || 3001);
const appHostname = process.env.HOSTNAME || fileEnv.HOSTNAME || "127.0.0.1";
const ngrokBin = process.env.NGROK_BIN || fileEnv.NGROK_BIN || "ngrok";
const cloudflaredBin = process.env.CLOUDFLARED_BIN || fileEnv.CLOUDFLARED_BIN || "/opt/homebrew/bin/cloudflared";
const cloudflaredMetricsAddress = process.env.CLOUDFLARED_METRICS || fileEnv.CLOUDFLARED_METRICS || DEFAULT_CLOUDFLARED_METRICS;
const cloudflaredProxyMetricsAddress =
  process.env.CLOUDFLARED_PROXY_METRICS || fileEnv.CLOUDFLARED_PROXY_METRICS || "127.0.0.1:20242";
const cloudflaredProxyUrl = process.env.CLOUDFLARED_PROXY_URL || fileEnv.CLOUDFLARED_PROXY_URL || "http://127.0.0.1:7897";
const cloudflareTunnelUrl =
  process.env.CLOUDFLARE_TUNNEL_URL || fileEnv.CLOUDFLARE_TUNNEL_URL || process.env.CLOUDFLARE_PUBLIC_URL || fileEnv.CLOUDFLARE_PUBLIC_URL || "https://bick.qingpao.fun/";
const productionHealthUrl = `http://127.0.0.1:${appPort}/api/system/health`;
const developmentHealthUrl = `http://127.0.0.1:${developmentPort}/api/system/health`;
const autoSyncUrl = `http://127.0.0.1:${appPort}/api/system/auto-sync`;
const ngrokApiUrl = "http://127.0.0.1:4040/api/tunnels";
const packageJson = JSON.parse(readFileSync(path.join(projectDir, "package.json"), "utf8"));
process.env.DATABASE_URL ||= fileEnv.DATABASE_URL || `file:${path.join(projectDir, "data", "app.db")}`;
const internalSyncSecret = process.env.INTERNAL_SYNC_SECRET || fileEnv.INTERNAL_SYNC_SECRET || "";
const prisma = new PrismaClient();

mkdirSync(runtimeDir, { recursive: true });
mkdirSync(releaseRootDir, { recursive: true });

function readState() {
  if (!existsSync(statePath)) {
    return { watchdogEnabled: true, failureCount: 0, lastAction: "init", lastCheckedAt: null };
  }
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function writeState(next) {
  writeFileSync(statePath, JSON.stringify(next, null, 2), "utf8");
}

function readPid(filePath) {
  if (!existsSync(filePath)) return null;
  return Number(readFileSync(filePath, "utf8"));
}

function tailFile(filePath, lines = 80) {
  if (!existsSync(filePath)) return "";
  return readFileSync(filePath, "utf8").split(/\r?\n/).slice(-lines).join("\n");
}

function canAppendFile(filePath) {
  try {
    if (existsSync(filePath)) {
      accessSync(filePath, fsConstants.W_OK);
    } else {
      accessSync(path.dirname(filePath), fsConstants.W_OK);
    }
    return true;
  } catch {
    return false;
  }
}

function readNgrokPid() {
  if (!existsSync(ngrokPidPath)) return null;
  return Number(readFileSync(ngrokPidPath, "utf8"));
}

function getListeningPid(port) {
  try {
    const output = execFileSync("/usr/sbin/lsof", ["-nP", "-tiTCP:" + String(port), "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!output) return null;
    const pid = Number(output.split(/\r?\n/)[0]);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function terminatePid(pid, signal = "SIGTERM") {
  if (!pid || !isProcessRunning(pid)) return;
  try {
    process.kill(-pid, signal);
    return;
  } catch {}

  try {
    process.kill(pid, signal);
  } catch {}
}

async function healthCheck(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureBuild() {
  const buildId = path.join(productionDir, ".next", "BUILD_ID");
  if (existsSync(buildId)) return;
  await ensureProductionWorkspace({ rebuild: true });
}

function runCommand(command, args, cwd = projectDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function runCommandQuiet(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectDir,
      stdio: "ignore",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

function getNextBin(cwd) {
  return path.join(cwd, "node_modules", "next", "dist", "bin", "next");
}

async function waitForHealth(url, attempts = 20, intervalMs = 500) {
  for (let index = 0; index < attempts; index += 1) {
    if (await healthCheck(url)) {
      return true;
    }
    await wait(intervalMs);
  }
  return false;
}

async function startProductionApp({ rebuild = false } = {}) {
  const existingPid = getListeningPid(appPort) || readPid(productionPidPath);
  if (isProcessRunning(existingPid) && (await healthCheck(productionHealthUrl))) {
    writeFileSync(productionPidPath, String(existingPid), "utf8");
    return { ok: true, message: "Production app already running." };
  }

  if (rebuild) {
    await ensureProductionWorkspace({ rebuild: true });
  } else {
    await ensureBuild();
  }

  const stdout = createWriteStream(productionStdoutPath, { flags: "a" });
  const stderr = createWriteStream(productionStderrPath, { flags: "a" });
  const child = spawn(process.execPath, [getNextBin(productionDir), "start", "--hostname", appHostname, "--port", String(appPort)], {
    cwd: productionDir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: {
      ...process.env,
      ...fileEnv,
      NODE_ENV: "production",
      APP_PORT: String(appPort),
      PORT: String(appPort),
      HOSTNAME: appHostname,
    },
  });
  child.on("error", (error) => {
    const state = readState();
    writeState({ ...state, lastAction: `start-production-error:${error.message}`, lastCheckedAt: new Date().toISOString() });
  });

  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  child.unref();
  writeFileSync(productionPidPath, String(child.pid), "utf8");
  const healthy = await waitForHealth(productionHealthUrl);
  const state = readState();
  if (!healthy) {
    writeState({ ...state, lastAction: `start-production-failed:${child.pid}`, lastCheckedAt: new Date().toISOString(), failureCount: 0 });
    return { ok: false, message: `Production app started as pid ${child.pid}, but health check did not pass.` };
  }

  writeState({ ...state, lastAction: `start-production:${child.pid}`, lastCheckedAt: new Date().toISOString(), failureCount: 0 });
  return { ok: true, message: `Started production app pid ${child.pid}.` };
}

async function stopProductionApp() {
  const pid = readPid(productionPidPath);
  const listeningPid = getListeningPid(appPort);
  const targetPids = Array.from(new Set([pid, listeningPid].filter(Boolean)));
  if (!targetPids.length) {
    return { ok: true, message: "Production app not running." };
  }

  for (const targetPid of targetPids) {
    await terminatePid(targetPid, "SIGTERM");
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  for (const targetPid of targetPids) {
    if (isProcessRunning(targetPid)) {
      await terminatePid(targetPid, "SIGKILL");
    }
  }

  if (existsSync(productionPidPath)) unlinkSync(productionPidPath);
  const state = readState();
  writeState({ ...state, lastAction: `stop-production:${targetPids.join(",")}`, lastCheckedAt: new Date().toISOString(), failureCount: 0 });
  return { ok: true, message: `Stopped production app pid ${targetPids.join(",")}.` };
}

async function restartProductionApp({ rebuild = false } = {}) {
  await stopProductionApp();
  return startProductionApp({ rebuild });
}

async function startDevelopmentApp() {
  const existingPid = getListeningPid(developmentPort) || readPid(developmentPidPath);
  if (isProcessRunning(existingPid) && (await healthCheck(developmentHealthUrl))) {
    writeFileSync(developmentPidPath, String(existingPid), "utf8");
    return { ok: true, message: "Development app already running." };
  }

  const stdout = createWriteStream(developmentStdoutPath, { flags: "a" });
  const stderr = createWriteStream(developmentStderrPath, { flags: "a" });
  const child = spawn(process.execPath, [getNextBin(projectDir), "dev", "--hostname", appHostname, "--port", String(developmentPort)], {
    cwd: projectDir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: {
      ...process.env,
      ...fileEnv,
      NODE_ENV: "development",
      APP_PORT: String(developmentPort),
      PORT: String(developmentPort),
      HOSTNAME: appHostname,
    },
  });
  child.on("error", (error) => {
    const state = readState();
    writeState({ ...state, lastAction: `start-development-error:${error.message}`, lastCheckedAt: new Date().toISOString() });
  });

  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  child.unref();
  writeFileSync(developmentPidPath, String(child.pid), "utf8");
  const healthy = await waitForHealth(developmentHealthUrl);
  const state = readState();
  if (!healthy) {
    writeState({ ...state, lastAction: `start-development-failed:${child.pid}`, lastCheckedAt: new Date().toISOString() });
    return { ok: false, message: `Development app started as pid ${child.pid}, but health check did not pass.` };
  }

  writeState({ ...state, lastAction: `start-development:${child.pid}`, lastCheckedAt: new Date().toISOString() });
  return { ok: true, message: `Started development app pid ${child.pid}.` };
}

async function stopDevelopmentApp() {
  const pid = readPid(developmentPidPath);
  const listeningPid = getListeningPid(developmentPort);
  const targetPids = Array.from(new Set([pid, listeningPid].filter(Boolean)));
  if (!targetPids.length) {
    return { ok: true, message: "Development app not running." };
  }

  for (const targetPid of targetPids) {
    await terminatePid(targetPid, "SIGTERM");
  }

  await wait(1500);

  for (const targetPid of targetPids) {
    if (isProcessRunning(targetPid)) {
      await terminatePid(targetPid, "SIGKILL");
    }
  }

  if (existsSync(developmentPidPath)) unlinkSync(developmentPidPath);
  const state = readState();
  writeState({ ...state, lastAction: `stop-development:${targetPids.join(",")}`, lastCheckedAt: new Date().toISOString() });
  return { ok: true, message: `Stopped development app pid ${targetPids.join(",")}.` };
}

async function restartDevelopmentApp() {
  await stopDevelopmentApp();
  return startDevelopmentApp();
}

async function startNgrok() {
  const status = await getNgrokStatus();
  if (status.running && status.publicUrl) {
    return { ok: true, message: `ngrok already running: ${status.publicUrl}` };
  }

  const existingPid = readNgrokPid();
  if (isProcessRunning(existingPid)) {
    await wait(1500);
    const retried = await getNgrokStatus();
    if (retried.running && retried.publicUrl) {
      return { ok: true, message: `ngrok recovered: ${retried.publicUrl}` };
    }
  }

  const stdout = createWriteStream(ngrokLogPath, { flags: "a" });
  const child = spawn(ngrokBin, ["http", String(appPort)], {
    cwd: projectDir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: buildCloudflaredEnv({
      baseEnv: {
        ...process.env,
        ...fileEnv,
      },
      proxyUrl: cloudflaredProxyUrl,
    }),
  });

  child.stdout.pipe(stdout);
  child.stderr.pipe(stdout);
  child.unref();
  writeFileSync(ngrokPidPath, String(child.pid), "utf8");

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await wait(800);
    const next = await getNgrokStatus();
    if (next.running && next.publicUrl) {
      const state = readState();
      writeState({ ...state, lastAction: `start-ngrok:${child.pid}`, lastCheckedAt: new Date().toISOString() });
      return { ok: true, message: `Started ngrok pid ${child.pid}.`, publicUrl: next.publicUrl };
    }
  }

  return { ok: false, message: "ngrok 启动失败，请检查 ngrok.log。" };
}

async function stopNgrok() {
  const pid = readNgrokPid();
  if (!pid || !isProcessRunning(pid)) {
    return { ok: true, message: "ngrok not running." };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {}

  await wait(1200);

  if (isProcessRunning(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }

  if (existsSync(ngrokPidPath)) unlinkSync(ngrokPidPath);
  const state = readState();
  writeState({ ...state, lastAction: `stop-ngrok:${pid}`, lastCheckedAt: new Date().toISOString() });
  return { ok: true, message: `Stopped ngrok pid ${pid}.` };
}

function shouldSkipProductionCopy(relative) {
  return (
    relative === "node_modules" ||
    relative.startsWith(`node_modules${path.sep}`) ||
    relative === ".git" ||
    relative.startsWith(`.git${path.sep}`) ||
    relative === ".worktrees" ||
    relative.startsWith(`.worktrees${path.sep}`) ||
    relative === ".next" ||
    relative.startsWith(`.next${path.sep}`) ||
    relative === ".runtime" ||
    relative.startsWith(`.runtime${path.sep}`) ||
    relative === "data/app.db" ||
    relative.startsWith(`data/manager${path.sep}`) ||
    relative === "data/manager"
  );
}

function syncProjectToProduction() {
  try {
    rmSync(productionDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    if ((error && error.code) !== "ENOTEMPTY" || !existsSync(productionDir)) {
      throw error;
    }

    for (const entry of readdirSync(productionDir, { withFileTypes: true })) {
      rmSync(path.join(productionDir, entry.name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }

    rmSync(productionDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  mkdirSync(productionDir, { recursive: true });

  for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
    const relative = entry.name;
    if (shouldSkipProductionCopy(relative)) continue;

    cpSync(path.join(projectDir, entry.name), path.join(productionDir, entry.name), {
      recursive: true,
      filter(source) {
        const nestedRelative = path.relative(projectDir, source);
        return !shouldSkipProductionCopy(nestedRelative);
      },
    });
  }

  const prodNodeModules = path.join(productionDir, "node_modules");
  try {
    symlinkSync(path.join(projectDir, "node_modules"), prodNodeModules, "dir");
  } catch {}
}

async function ensureProductionWorkspace({ rebuild = false } = {}) {
  const buildId = path.join(productionDir, ".next", "BUILD_ID");
  if (!existsSync(productionDir) || rebuild || !existsSync(buildId)) {
    syncProjectToProduction();
    await runCommand("npm", ["run", "build"], productionDir);
  }
}

async function getReleaseStatus() {
  const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
  return {
    developmentVersion: config?.developmentVersion ?? `${packageJson.version}-dev`,
    productionVersion: config?.productionVersion ?? packageJson.version,
    lastPublishedAt: config?.lastPublishedAt?.toISOString() ?? null,
    productionDir,
    productionBuildReady: existsSync(path.join(productionDir, ".next", "BUILD_ID")),
  };
}

async function updateDevelopmentVersion(version) {
  const nextVersion = String(version ?? "").trim();
  if (!nextVersion) {
    return { ok: false, error: "开发版本号不能为空。" };
  }

  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {
      developmentVersion: nextVersion,
      updatedAt: new Date(),
    },
    create: {
      id: 1,
      appName: "AI 骑行助手",
      authMode: "invite_only",
      maintenanceMode: false,
      maintenanceMessage: null,
      featureRidePlans: true,
      featureRecovery: true,
      featureAiReview: true,
      featureIntervalsSync: true,
      aiEnabled: false,
      aiBaseUrl: null,
      aiApiKeyEncrypted: null,
      aiModel: null,
      aiSystemPrompt: null,
      developmentVersion: nextVersion,
      productionVersion: packageJson.version,
      lastPublishedAt: null,
      updatedAt: new Date(),
    },
  });

  const state = readState();
  writeState({ ...state, lastAction: `set-dev-version:${nextVersion}`, lastCheckedAt: new Date().toISOString() });
  return {
    ok: true,
    message: `开发版本号已更新为 ${nextVersion}`,
    release: await getReleaseStatus(),
  };
}

async function publishRelease() {
  const release = await getReleaseStatus();
  await ensureProductionWorkspace({ rebuild: true });
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {
      productionVersion: release.developmentVersion,
      lastPublishedAt: new Date(),
      updatedAt: new Date(),
    },
    create: {
      id: 1,
      appName: "AI 骑行助手",
      authMode: "invite_only",
      maintenanceMode: false,
      maintenanceMessage: null,
      featureRidePlans: true,
      featureRecovery: true,
      featureAiReview: true,
      featureIntervalsSync: true,
      aiEnabled: false,
      aiBaseUrl: null,
      aiApiKeyEncrypted: null,
      aiModel: null,
      aiSystemPrompt: null,
      developmentVersion: `${packageJson.version}-dev`,
      productionVersion: release.developmentVersion,
      lastPublishedAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const restart = await restartProductionApp();
  const state = readState();
  writeState({ ...state, lastAction: `publish:${release.developmentVersion}`, lastCheckedAt: new Date().toISOString() });
  return {
    ok: true,
    message: `已发布开发版本 ${release.developmentVersion} 到线上。`,
    restart,
    release: await getReleaseStatus(),
  };
}

async function listManagedUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      intervalsAthleteId: true,
      weightKg: true,
      ftp: true,
      thresholdHr: true,
      maxHr: true,
      restingHr: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return users.map((user) => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }));
}

function getAutostartStatus() {
  return {
    installed: existsSync(launchAgentPath),
    label: launchAgentLabel,
    plistPath: launchAgentPath,
  };
}

function buildLaunchAgentPlist() {
  const nodeBin = process.execPath;
  const scriptPath = path.join(projectDir, "scripts", "system-manager.mjs");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${launchAgentLabel}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${scriptPath}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectDir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${managerLogPath}</string>
  <key>StandardErrorPath</key>
  <string>${managerLogPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>`;
}

async function installAutostart() {
  mkdirSync(launchAgentDir, { recursive: true });
  writeFileSync(launchAgentPath, buildLaunchAgentPlist(), "utf8");

  try {
    await runCommandQuiet("/bin/launchctl", ["bootout", `gui/${process.getuid()}`, launchAgentPath]);
  } catch {}

  await runCommandQuiet("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, launchAgentPath]);
  await runCommandQuiet("/bin/launchctl", ["enable", `gui/${process.getuid()}/${launchAgentLabel}`]);
  const state = readState();
  writeState({ ...state, lastAction: "install-autostart", lastCheckedAt: new Date().toISOString() });
  return { ok: true, message: "系统管家已加入开机自启。", ...getAutostartStatus() };
}

async function uninstallAutostart() {
  try {
    await runCommandQuiet("/bin/launchctl", ["bootout", `gui/${process.getuid()}`, launchAgentPath]);
  } catch {}

  if (existsSync(launchAgentPath)) {
    unlinkSync(launchAgentPath);
  }

  const state = readState();
  writeState({ ...state, lastAction: "uninstall-autostart", lastCheckedAt: new Date().toISOString() });
  return { ok: true, message: "系统管家已移出开机自启。", ...getAutostartStatus() };
}

async function getStatus() {
  const productionPid = getListeningPid(appPort) || readPid(productionPidPath);
  const developmentPid = getListeningPid(developmentPort) || readPid(developmentPidPath);
  const productionRunning = isProcessRunning(productionPid);
  const developmentRunning = isProcessRunning(developmentPid);
  const productionHealthy = productionRunning ? await healthCheck(productionHealthUrl) : false;
  const developmentHealthy = developmentRunning;

  if (productionRunning && productionPid) {
    writeFileSync(productionPidPath, String(productionPid), "utf8");
  } else if ((!productionRunning || !productionHealthy) && existsSync(productionPidPath)) {
    try {
      unlinkSync(productionPidPath);
    } catch {}
  }

  if (developmentRunning && developmentPid) {
    writeFileSync(developmentPidPath, String(developmentPid), "utf8");
  } else if ((!developmentRunning || !developmentHealthy) && existsSync(developmentPidPath)) {
    try {
      unlinkSync(developmentPidPath);
    } catch {}
  }

  const state = readState();
  const ngrok = await getNgrokStatus();
  const cloudflared = await getCloudflaredStatus();
  const release = await getReleaseStatus();
  return {
    running: productionRunning,
    healthy: productionHealthy,
    pid: productionRunning ? productionPid : null,
    managerPort,
    appPort,
    developmentPort,
    appHostname,
    production: {
      running: productionRunning,
      healthy: productionHealthy,
      pid: productionRunning ? productionPid : null,
      port: appPort,
      url: `http://127.0.0.1:${appPort}`,
    },
    development: {
      running: developmentRunning,
      healthy: developmentHealthy,
      pid: developmentRunning ? developmentPid : null,
      port: developmentPort,
      url: `http://127.0.0.1:${developmentPort}`,
    },
    ngrok,
    cloudflared,
    release,
    logs: {
      stdoutPath: productionStdoutPath,
      stderrPath: productionStderrPath,
      developmentStdoutPath,
      developmentStderrPath,
      ngrokLogPath,
      cloudflaredLogPath,
      cloudflaredErrPath,
      legacyCloudflaredErrPath,
      cloudflaredManagerLogPath,
      cloudflaredManagerErrPath,
      managerLogPath,
    },
    autostart: getAutostartStatus(),
    watchdogEnabled: Boolean(state.watchdogEnabled),
    failureCount: state.failureCount ?? 0,
    lastAction: state.lastAction ?? "none",
    lastCheckedAt: state.lastCheckedAt,
  };
}

async function getNgrokStatus() {
  try {
    const response = await fetch(ngrokApiUrl, { cache: "no-store" });
    if (!response.ok) {
      return { running: false };
    }
    const payload = await response.json();
    const tunnels = Array.isArray(payload.tunnels) ? payload.tunnels : [];
    const httpsTunnel = tunnels.find((item) => item.proto === "https") || tunnels[0];
  return {
      running: true,
      publicUrl: httpsTunnel?.public_url ?? null,
      pid: readNgrokPid(),
    };
  } catch {
    return { running: false, pid: readNgrokPid() };
  }
}

// ---- cloudflared ----

function readCloudflaredPid() {
  try {
    if (!existsSync(cloudflaredPidPath)) return null;
    return Number(readFileSync(cloudflaredPidPath, "utf8"));
  } catch {
    return null;
  }
}

function readCloudflaredToken() {
  const envToken = process.env.CLOUDFLARE_TUNNEL_TOKEN || fileEnv.CLOUDFLARE_TUNNEL_TOKEN || "";
  if (envToken.trim()) return envToken.trim();
  if (!existsSync(cloudflaredTokenPath)) return "";
  return readFileSync(cloudflaredTokenPath, "utf8").trim();
}

function getCloudflaredPids() {
  const pids = new Set();
  const savedPid = readCloudflaredPid();
  if (Number.isFinite(savedPid)) pids.add(savedPid);

  try {
    const output = execFileSync("/usr/bin/pgrep", ["-la", "cloudflared"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const pid of parseCloudflaredPids(output)) pids.add(pid);
  } catch {}

  return [...pids].filter((pid) => isProcessRunning(pid));
}

async function readCloudflaredMetrics(metricsAddress = cloudflaredMetricsAddress) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const resp = await fetch(`http://${metricsAddress}/metrics`, { signal: controller.signal });
    return resp.ok ? await resp.text() : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function isCloudflaredHealthy() {
  if (getCloudflaredPids().length === 0) return false;
  const proxyMetrics = await readCloudflaredMetrics(cloudflaredProxyMetricsAddress);
  const primaryMetrics = proxyMetrics || (await readCloudflaredMetrics(cloudflaredMetricsAddress));
  if (parseHaConnections(primaryMetrics) < 1) return false;

  const publicCheck = await checkCloudflarePublicUrl();
  return publicCheck.healthy;
}

async function checkCloudflarePublicUrl() {
  if (!cloudflareTunnelUrl) return { configured: false, healthy: true, statusCode: null };

  try {
    const output = execFileSync(
      "/usr/bin/curl",
      ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "5", "--proxy", cloudflaredProxyUrl, cloudflareTunnelUrl],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 6500 },
    ).trim();
    const statusCode = Number(output);
    return {
      configured: true,
      healthy: statusCode >= 200 && statusCode < 400,
      statusCode,
    };
  } catch {
    return { configured: true, healthy: false, statusCode: null };
  }
}

async function getCloudflaredStatus() {
  const pids = getCloudflaredPids();
  const proxyPid = readPid(cloudflaredProxyPidPath);
  const running = pids.length > 0;
  const proxyMetrics = running ? await readCloudflaredMetrics(cloudflaredProxyMetricsAddress) : "";
  const directMetrics = running && !proxyMetrics ? await readCloudflaredMetrics(cloudflaredMetricsAddress) : "";
  const metrics = proxyMetrics || directMetrics;
  const actualPid = proxyMetrics && pids.includes(proxyPid) ? proxyPid : (pids[0] ?? null);
  if (actualPid) persistPidIfWritable(cloudflaredPidPath, actualPid, { writeFileSync });
  const haConnections = parseHaConnections(metrics);
  const publicCheck = await checkCloudflarePublicUrl();
  const healthy = running && haConnections >= 1 && publicCheck.healthy;
  return {
    running,
    healthy,
    pid: running ? actualPid : null,
    pids,
    haConnections,
    metricsAddress: proxyMetrics ? cloudflaredProxyMetricsAddress : cloudflaredMetricsAddress,
    primaryMetricsAddress: cloudflaredMetricsAddress,
    proxyMetricsAddress: cloudflaredProxyMetricsAddress,
    publicUrl: cloudflareTunnelUrl || null,
    publicStatusCode: publicCheck.statusCode,
    tokenExists: Boolean(readCloudflaredToken()),
  };
}

async function startCloudflared() {
  const status = await getCloudflaredStatus();
  if (status.running && status.healthy) {
    return { ok: true, message: "cloudflared already running and healthy." };
  }

  const token = readCloudflaredToken();
  if (!token) {
    return { ok: false, message: "cloudflared token is empty. Set CLOUDFLARE_TUNNEL_TOKEN or data/manager/cloudflared-token.txt." };
  }

  const managedPid = readCloudflaredPid();
  if (managedPid && isProcessRunning(managedPid)) {
    await terminatePid(managedPid);
    await wait(1000);
  }

  const child = spawn(cloudflaredBin, buildCloudflaredArgs(token, { metricsAddress: cloudflaredProxyMetricsAddress }), {
    cwd: projectDir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  const childLogPath = chooseWritableLogPath(cloudflaredLogPath, cloudflaredManagerLogPath, canAppendFile);
  const childErrPath = chooseWritableLogPath(cloudflaredErrPath, cloudflaredManagerErrPath, canAppendFile);
  const outStream = createWriteStream(childLogPath, { flags: "a" });
  const errStream = createWriteStream(childErrPath, { flags: "a" });
  outStream.on("error", () => {});
  errStream.on("error", () => {});
  child.stdout.pipe(outStream);
  child.stderr.pipe(errStream);
  child.unref();
  persistPidIfWritable(cloudflaredPidPath, child.pid, { writeFileSync });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await wait(1000);
    if (!isProcessRunning(child.pid)) {
      return { ok: false, message: `cloudflared pid ${child.pid} exited early. Check ${childErrPath}.` };
    }
    if (await isCloudflaredHealthy()) {
      const state = readState();
      writeState({ ...state, lastAction: `start-cloudflared:${child.pid}`, lastCheckedAt: new Date().toISOString() });
      return { ok: true, message: `Started healthy cloudflared pid ${child.pid}.`, pid: child.pid };
    }
  }

  const state = readState();
  writeState({ ...state, lastAction: `start-cloudflared:${child.pid}`, lastCheckedAt: new Date().toISOString() });
  return { ok: true, message: `Started cloudflared pid ${child.pid}, waiting for HA connections on ${cloudflaredProxyMetricsAddress}.`, pid: child.pid };
}

async function stopCloudflared() {
  const pidsToKill = getCloudflaredPids();

  for (const targetPid of pidsToKill) {
    try {
      process.kill(targetPid, "SIGTERM");
    } catch {}
  }

  await wait(1500);

  for (const targetPid of pidsToKill) {
    if (isProcessRunning(targetPid)) {
      try {
        process.kill(targetPid, "SIGKILL");
      } catch {}
    }
  }

  const stillRunning = pidsToKill.filter((targetPid) => isProcessRunning(targetPid));
  if (stillRunning.length === 0) removePidFileIfPossible(cloudflaredPidPath, { existsSync, unlinkSync });

  const state = readState();
  writeState({ ...state, lastAction: `stop-cloudflared:${pidsToKill.join(",")}`, lastCheckedAt: new Date().toISOString() });
  if (stillRunning.length > 0) {
    return {
      ok: false,
      message: `cloudflared still running: ${stillRunning.join(", ")}. If it is root-owned, restart the LaunchDaemon guard with scripts/setup-launchd.sh.`,
      pids: stillRunning,
    };
  }
  return { ok: true, message: `Stopped cloudflared pids ${pidsToKill.join(",") || "none"}.` };
}

// ---- watchdog ----

async function handleWatchdog() {
  const state = readState();
  if (!state.watchdogEnabled) return;

  const status = await getStatus();
  let failureCount = state.failureCount ?? 0;

  if (!status.production?.running || !status.production?.healthy) {
    failureCount += 1;
  } else {
    failureCount = 0;
  }

  if (failureCount >= 3) {
    await restartProductionApp();
    failureCount = 0;
  }

  if (!status.cloudflared?.running || !status.cloudflared?.healthy) {
    await startCloudflared();
  }

  writeState({
    ...state,
    failureCount,
    lastCheckedAt: new Date().toISOString(),
  });
}

let autoSyncInFlight = false;

async function runAutoSyncTick() {
  if (autoSyncInFlight || !internalSyncSecret) return;
  autoSyncInFlight = true;
  try {
    await fetch(autoSyncUrl, {
      method: "POST",
      headers: {
        "x-internal-sync-secret": internalSyncSecret,
      },
    });
  } catch (error) {
    const state = readState();
    writeState({
      ...state,
      lastAction: `auto-sync-error:${error.message}`,
      lastCheckedAt: new Date().toISOString(),
    });
  } finally {
    autoSyncInFlight = false;
  }
}

setInterval(() => {
  handleWatchdog().catch((error) => {
    const state = readState();
    writeState({
      ...state,
      lastAction: `watchdog-error:${error.message}`,
      lastCheckedAt: new Date().toISOString(),
    });
  });
}, 60_000);

setInterval(() => {
  runAutoSyncTick().catch((error) => {
    const state = readState();
    writeState({
      ...state,
      lastAction: `auto-sync-tick-error:${error.message}`,
      lastCheckedAt: new Date().toISOString(),
    });
  });
}, 60_000);

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI 骑行助手系统管家</title>
  <style>
    :root{color-scheme:light;--bg:#f4f7fb;--bg-2:#e9eef8;--panel:rgba(255,255,255,.86);--panel-strong:#fff;--line:rgba(30,51,93,.12);--line-strong:rgba(30,51,93,.22);--text:#12213d;--muted:#657796;--accent:#2563eb;--accent-2:#4f8df7;--accent-soft:rgba(37,99,235,.08);--ok:#0f8a62;--bad:#c34735;--warn:#f59e0b;--shadow:0 22px 48px rgba(29,49,90,.12);--shadow-soft:0 14px 28px rgba(29,49,90,.08);--radius-xl:28px;--radius-lg:22px;--radius-md:16px}
    *{box-sizing:border-box}
    body{margin:0;font-family:"IBM Plex Sans",ui-sans-serif,system-ui,-apple-system,sans-serif;background:radial-gradient(circle at top left,rgba(79,141,247,.22),transparent 24%),radial-gradient(circle at top right,rgba(245,158,11,.14),transparent 18%),linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 100%);color:var(--text)}
    .wrap{max-width:1180px;margin:0 auto;padding:22px}
    .hero,.panel,.stat{background:var(--panel);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.72);box-shadow:var(--shadow)}
    .hero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(320px,.95fr);gap:18px;padding:24px;border-radius:34px;margin-bottom:18px}
    .hero::before{content:"";position:absolute;inset:auto auto -80px -60px;width:220px;height:220px;border-radius:999px;background:radial-gradient(circle,rgba(37,99,235,.16),transparent 66%)}
    .eyebrow{font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
    h1,h2,h3,strong,.big{font-family:"Space Grotesk","IBM Plex Sans",sans-serif;letter-spacing:-.04em}
    h1{margin:8px 0 10px;font-size:clamp(2rem,4vw,3rem);line-height:.98}
    h2{margin:0;font-size:1.25rem}
    h3{margin:0;font-size:1rem}
    p,li,button,code,pre{font-size:.96rem;line-height:1.58}
    .muted{color:var(--muted)}
    .hero-copy{display:grid;gap:14px}
    .hero-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .stat,.panel{border-radius:var(--radius-xl)}
    .stat{padding:18px;background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(244,248,255,.88))}
    .big{margin-top:6px;font-size:1.7rem;line-height:1}
    .hero-side{display:grid;gap:14px}
    .chip-row,.actions{display:flex;flex-wrap:wrap;gap:10px}
    .chip{display:inline-flex;align-items:center;min-height:34px;padding:0 12px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:.84rem;font-weight:700}
    .grid{display:grid;grid-template-columns:1.15fr .95fr;gap:16px;margin-top:16px}
    .grid-three{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
    .env-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
    .panel{padding:18px}
    .panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    .status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .status-item{padding:14px 16px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.78)}
    .env-card{padding:20px;border-radius:24px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(244,248,255,.86))}
    .env-card.dev{box-shadow:0 14px 28px rgba(37,99,235,.08);background:linear-gradient(180deg,rgba(242,247,255,.98),rgba(232,241,255,.9));border-color:rgba(37,99,235,.16)}
    .env-card.prod{box-shadow:0 14px 28px rgba(230,126,34,.08);background:linear-gradient(180deg,rgba(255,249,241,.98),rgba(255,242,223,.9));border-color:rgba(245,158,11,.18)}
    .env-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    .env-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:14px}
    .env-actions{display:flex;flex-wrap:wrap;gap:10px}
    .release-banner{padding:16px 18px;border-radius:20px;border:1px solid var(--line);background:linear-gradient(135deg,rgba(37,99,235,.06),rgba(245,158,11,.08))}
    .release-banner strong{display:block;margin-bottom:6px}
    .release-notes{margin:12px 0 0;padding:0 0 0 18px;color:var(--muted);display:grid;gap:8px}
    .release-status{padding:14px 16px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.9);white-space:pre-wrap;min-height:108px}
    .release-status.ok{border-color:rgba(15,138,98,.2);background:rgba(15,138,98,.06)}
    .release-status.bad{border-color:rgba(196,77,59,.2);background:rgba(196,77,59,.06)}
    .release-status.neutral{border-color:var(--line);background:rgba(255,255,255,.9)}
    .env-badge{display:inline-flex;align-items:center;min-height:28px;padding:0 10px;border-radius:999px;font-size:.78rem;font-weight:700}
    .env-badge.dev{background:rgba(37,99,235,.1);color:var(--accent)}
    .env-badge.prod{background:rgba(245,158,11,.16);color:#b36d07}
    .label{display:block;font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
    .value{display:block;margin-top:8px;font-weight:700;word-break:break-word}
    .actions{margin-top:14px}
    button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid transparent;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;font:inherit;font-weight:700;cursor:pointer;transition:transform 160ms ease,box-shadow 160ms ease,opacity 160ms ease;border:none;box-shadow:0 16px 26px rgba(37,99,235,.22)}
    button:hover{transform:translateY(-1px)}
    button.secondary{background:rgba(255,255,255,.86);border:1px solid var(--line);color:var(--text);box-shadow:none}
    button.warn{background:linear-gradient(135deg,#e67e22,#f59e0b)}
    button.danger{background:linear-gradient(135deg,#d14a36,#c34735)}
    button.ghost{background:rgba(255,255,255,.7);border:1px dashed var(--line-strong);color:var(--text);box-shadow:none}
    button[disabled]{cursor:not-allowed;opacity:.56;transform:none}
    .result-box,.log-box{white-space:pre-wrap;background:rgba(255,255,255,.92);padding:14px;border-radius:18px;border:1px solid var(--line);overflow:auto}
    .result-box{min-height:120px}
    .log-box{max-height:240px}
    .list{margin:0;padding-left:18px;display:grid;gap:10px}
    .ok{color:var(--ok)} .bad{color:var(--bad)} .warn-text{color:#b36d07}
    .link{color:var(--accent);font-weight:700;text-decoration:none}
    .toolbar{display:flex;flex-wrap:wrap;gap:10px}
    .seg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .inline-code{padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent)}
    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.92)}
    table{width:100%;border-collapse:collapse}
    th,td{padding:12px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
    th{font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:rgba(37,99,235,.06)}
    tbody tr:last-child td{border-bottom:none}
    .pill{display:inline-flex;align-items:center;min-height:28px;padding:0 10px;border-radius:999px;font-size:.8rem;font-weight:700}
    .pill.admin{background:rgba(37,99,235,.1);color:var(--accent)}
    .pill.user{background:rgba(15,138,98,.1);color:var(--ok)}
    @media(max-width:980px){.hero,.grid,.seg,.status-grid,.hero-kpis,.env-grid,.env-meta{grid-template-columns:1fr}}
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow">Mac mini System Manager</div>
        <h1>AI 骑行助手系统管家</h1>
        <p class="muted">现在明确区分开发版和线上版。开发版是热更新模式，改代码后直接刷新 3001 看效果；线上版才绑定公网入口、构建发布和自动巡检。</p>
        <div class="chip-row">
          <span class="chip">开发版独立入口</span>
          <span class="chip">线上版独立入口</span>
          <span class="chip">Cloudflare Tunnel 绑定线上</span>
        </div>
        <div class="hero-kpis" id="hero-kpis">
          <div class="stat"><span class="label">开发版</span><span class="big" id="kpi-dev">--</span></div>
          <div class="stat"><span class="label">线上版</span><span class="big" id="kpi-prod">--</span></div>
          <div class="stat"><span class="label">Cloudflare</span><span class="big" id="kpi-cf">--</span></div>
        </div>
      </div>
      <div class="hero-side">
        <div class="panel" style="padding:18px">
          <div class="panel-head">
            <h2>发布中心</h2>
            <span class="chip" id="busy-indicator">空闲</span>
          </div>
          <div class="release-banner">
            <strong>开发版改动只在 3001 生效</strong>
            <div class="muted">先在开发版验证效果，满意后再点击“发布上线”，把当前开发目录发布到 3000 线上版。</div>
            <ul class="release-notes">
              <li>左侧开发版只负责看最新改动，不做 build。</li>
              <li>右侧线上版才绑定公网、看门狗和正式访问。</li>
              <li>点击“一键发布到线上”后，会同步代码、重新构建并重启线上版。</li>
            </ul>
          </div>
          <div class="seg" style="margin-top:14px">
            <div class="status-item"><span class="label">开发版本号</span><span class="value" id="dev-version-hero">--</span></div>
            <div class="status-item"><span class="label">线上版本号</span><span class="value" id="prod-version-hero">--</span></div>
          </div>
          <div class="status-item" style="margin-top:14px">
            <span class="label">上次发布时间</span>
            <span class="value" id="published-at">尚未发布</span>
          </div>
          <div class="actions" id="actions" style="margin-top:14px">
            <button class="warn" data-label="一键发布到线上" onclick="call('/api/release/publish', this)">一键发布到线上</button>
            <button data-label="重新构建线上版" onclick="call('/api/rebuild-restart', this)">重新构建线上版</button>
            <button class="warn" data-label="启动 Cloudflare 公网入口" onclick="call('/api/cloudflared/start', this)">启动 CF 公网入口</button>
            <button class="secondary" data-label="停止 Cloudflare 公网入口" onclick="call('/api/cloudflared/stop', this)">停止 CF 公网入口</button>
            <button class="ghost" data-label="切换看门狗" onclick="call('/api/toggle-watchdog', this)">切换看门狗</button>
          </div>
          <div class="release-status neutral" id="publish-status" style="margin-top:14px">等待发布操作...

建议流程：
1. 在 3001 开发版确认改动
2. 点击“一键发布到线上”
3. 用 3000 或公网地址验收线上结果</div>
        </div>
      </div>
    </section>
    <section class="env-grid">
      <section class="env-card dev">
        <div class="env-title">
          <h2>左侧 开发版</h2>
          <span class="env-badge dev" id="dev-chip">热更新模式</span>
        </div>
        <div class="env-meta">
          <div class="status-item"><span class="label">版本号</span><span class="value" id="dev-version-panel">--</span></div>
          <div class="status-item"><span class="label">访问地址</span><span class="value"><a class="link" href="http://127.0.0.1:${developmentPort}" target="_blank">127.0.0.1:${developmentPort}</a></span></div>
          <div class="status-item"><span class="label">运行状态</span><span class="value" id="dev-running">--</span></div>
          <div class="status-item"><span class="label">PID</span><span class="value" id="dev-pid">--</span></div>
        </div>
        <div class="seg" style="margin-top:14px">
          <label class="status-item" style="gap:8px">
            <span class="label">开发版版本号</span>
            <input id="dev-version-input" type="text" placeholder="例如 0.1.1-dev.2" style="min-height:42px;border-radius:14px;border:1px solid var(--line);padding:0 12px;font:inherit" />
          </label>
          <div class="status-item" style="justify-content:flex-end">
            <span class="label">保存后可发布</span>
            <button data-label="保存开发版版本号" onclick="saveDevelopmentVersion(this)">保存开发版号</button>
          </div>
        </div>
        <ul class="list">
          <li>开发版使用热更新模式，无需 build。</li>
          <li>代码修改后刷新 <span class="inline-code">3001</span> 即可看到效果。</li>
          <li>开发版问题不会自动影响线上版。</li>
        </ul>
        <div class="env-actions">
          <button data-label="启动热更新开发版" onclick="call('/api/dev/start', this)">启动开发版</button>
          <button data-label="重启热更新开发版" onclick="call('/api/dev/restart', this)">重启开发版</button>
          <button class="secondary" data-label="停止开发版" onclick="call('/api/dev/stop', this)">停止开发版</button>
          <button class="secondary" type="button" onclick="window.open('http://127.0.0.1:${developmentPort}','_blank')">打开开发版</button>
        </div>
      </section>
      <section class="env-card prod">
        <div class="env-title">
          <h2>右侧 线上版</h2>
          <span class="env-badge prod" id="prod-chip">发布环境</span>
        </div>
        <div class="env-meta">
          <div class="status-item"><span class="label">版本号</span><span class="value" id="prod-version-panel">--</span></div>
          <div class="status-item"><span class="label">访问地址</span><span class="value"><a class="link" href="http://127.0.0.1:${appPort}" target="_blank">127.0.0.1:${appPort}</a></span></div>
          <div class="status-item"><span class="label">运行状态</span><span class="value" id="prod-running">--</span></div>
          <div class="status-item"><span class="label">PID</span><span class="value" id="prod-pid">--</span></div>
        </div>
        <ul class="list">
          <li>线上版只承接已验证通过的开发版代码。</li>
          <li>公网入口和看门狗只绑定线上版。</li>
          <li>需要更新线上效果时，先发布再重启线上版。</li>
        </ul>
        <div class="env-actions">
          <button data-label="启动线上版" onclick="call('/api/start', this)">启动线上版</button>
          <button data-label="重启线上版" onclick="call('/api/restart', this)">重启线上版</button>
          <button data-label="重新构建线上版" onclick="call('/api/rebuild-restart', this)">重新构建线上版</button>
          <button class="secondary" data-label="停止线上版" onclick="call('/api/stop', this)">停止线上版</button>
          <button class="secondary" type="button" onclick="window.open('http://127.0.0.1:${appPort}','_blank')">打开线上版</button>
        </div>
      </section>
    </section>
    <div class="grid">
      <section class="panel">
        <div class="panel-head">
          <h2>实时状态</h2>
          <div class="toolbar">
            <button class="secondary" type="button" onclick="refresh()">手动刷新</button>
          </div>
        </div>
        <div class="status-grid" id="status"></div>
      </section>
      <section class="panel">
        <div class="panel-head">
          <h2>版本与运行说明</h2>
          <span class="chip">当前主机 127.0.0.1:${managerPort}</span>
        </div>
        <div class="seg" style="margin-bottom:14px">
          <div class="status-item"><span class="label">开发版本</span><span class="value" id="dev-version">--</span></div>
          <div class="status-item"><span class="label">线上版本</span><span class="value" id="prod-version">--</span></div>
        </div>
        <ul>
          <li>开发版地址：<span class="inline-code">http://${appHostname}:${developmentPort}</span>（热更新，无需 build）</li>
          <li>线上版地址：<span class="inline-code">http://${appHostname}:${appPort}</span></li>
          <li>线上健康检查接口：<span class="inline-code">${productionHealthUrl}</span></li>
          <li>公网域名：<span class="inline-code">${cloudflareTunnelUrl || '未配置 CLOUDFLARE_TUNNEL_URL'}</span></li>
          <li>CF metrics：<span class="inline-code">http://${cloudflaredMetricsAddress}/metrics</span></li>
          <li>连续 3 次失败只会自动重启线上版，不会动开发版。</li>
          <li>如果发现 Cloudflare connector 掉线或 HA 连接为 0，看门狗会尝试恢复 CF 公网入口。</li>
          <li>开发版不走 build，代码修改后直接刷新开发版页面即可看效果。</li>
          <li>“重新构建线上版”会先执行 build，再拉起线上版。</li>
          <li>“发布上线”会把当前开发目录同步到线上运行目录、构建并切换线上版。</li>
          <li>线上运行目录：<span class="inline-code">${productionDir}</span></li>
          <li>线上日志：<span class="inline-code">${productionStdoutPath}</span>、<span class="inline-code">${productionStderrPath}</span></li>
          <li>开发日志：<span class="inline-code">${developmentStdoutPath}</span>、<span class="inline-code">${developmentStderrPath}</span></li>
          <li>CF stdout：<span class="inline-code">${cloudflaredLogPath}</span></li>
          <li>CF stderr：<span class="inline-code">${cloudflaredErrPath}</span></li>
        </ul>
      </section>
    </div>
    <div class="grid-three">
      <section class="panel">
        <div class="panel-head">
          <h2>开机自启</h2>
          <span class="chip" id="autostart-chip">检测中</span>
        </div>
        <p class="muted">将系统管家注册为当前 macOS 用户的 LaunchAgent，开机登录后自动运行。</p>
        <div class="actions">
          <button data-label="开启开机自启" onclick="call('/api/autostart/install', this)">开启开机自启</button>
          <button class="secondary" data-label="关闭开机自启" onclick="call('/api/autostart/uninstall', this)">关闭开机自启</button>
        </div>
        <pre class="result-box" id="autostart-info">等待读取...</pre>
      </section>
      <section class="panel">
        <div class="panel-head">
          <h2>最近操作</h2>
          <span class="muted">按钮执行结果</span>
        </div>
        <pre class="result-box" id="result">等待操作...</pre>
      </section>
      <section class="panel">
        <div class="panel-head">
          <h2>公网日志</h2>
          <button class="secondary" type="button" onclick="loadCloudflaredLog()">刷新 CF 日志</button>
        </div>
        <pre class="log-box" id="tunnel-log">等待读取...</pre>
      </section>
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head">
        <h2>账号管理</h2>
        <span class="muted">本地直连数据库读取</span>
      </div>
      <div class="table-wrap">
        <table>
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
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody id="users-body">
            <tr><td colspan="10" class="muted">加载中...</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
  <script>
    let busy = false;
    const actionButtonSelector = 'button[data-label]';

    function setBusy(next, label) {
      busy = next;
      document.querySelectorAll(actionButtonSelector).forEach((button) => {
        button.disabled = next;
      });
      const el = document.getElementById('busy-indicator');
      el.textContent = next ? (label || '操作中...') : '空闲';
    }

    function withTimestamp(text) {
      return '[' + new Date().toLocaleString() + ']\\n' + text;
    }

    function renderStatusCard(label, value, tone) {
      return '<div class="status-item"><span class="label">' + label + '</span><span class="value ' + (tone || '') + '">' + value + '</span></div>';
    }

    async function refresh() {
      const res = await fetch('/api/status');
      const data = await res.json();
      document.getElementById('status').innerHTML = [
        renderStatusCard('开发版', data.development && data.development.running ? '运行中' : '未运行', data.development && data.development.running ? 'ok' : 'bad'),
        renderStatusCard('开发版健康', data.development && data.development.healthy ? '正常' : '异常', data.development && data.development.healthy ? 'ok' : 'bad'),
        renderStatusCard('开发版 PID', data.development && data.development.pid ? String(data.development.pid) : '无'),
        renderStatusCard('线上版', data.production && data.production.running ? '运行中' : '未运行', data.production && data.production.running ? 'ok' : 'bad'),
        renderStatusCard('线上版健康', data.production && data.production.healthy ? '正常' : '异常', data.production && data.production.healthy ? 'ok' : 'bad'),
        renderStatusCard('线上版 PID', data.production && data.production.pid ? String(data.production.pid) : '无'),
        renderStatusCard('CF 隧道', data.cloudflared && data.cloudflared.running ? '运行中' : '未运行', data.cloudflared && data.cloudflared.healthy ? 'ok' : 'bad'),
        renderStatusCard('CF 隧道健康', data.cloudflared && data.cloudflared.healthy ? '正常' : '异常', data.cloudflared && data.cloudflared.healthy ? 'ok' : 'bad'),
        renderStatusCard('公网地址', data.cloudflared && data.cloudflared.publicUrl ? '<a class="link" href="' + data.cloudflared.publicUrl + '" target="_blank">' + data.cloudflared.publicUrl + '</a>' : '未配置', data.cloudflared && data.cloudflared.healthy ? 'ok' : 'warn-text'),
        renderStatusCard('CF HA 连接', data.cloudflared && Number.isFinite(data.cloudflared.haConnections) ? String(data.cloudflared.haConnections) : '0', data.cloudflared && data.cloudflared.haConnections > 0 ? 'ok' : 'bad'),
        renderStatusCard('CF Metrics', data.cloudflared && data.cloudflared.metricsAddress ? data.cloudflared.metricsAddress : '--', data.cloudflared && data.cloudflared.healthy ? 'ok' : 'warn-text'),
        renderStatusCard('CF 隧道 PID', data.cloudflared && data.cloudflared.pids && data.cloudflared.pids.length ? data.cloudflared.pids.join(', ') : '无'),
        renderStatusCard('看门狗', data.watchdogEnabled ? '已开启' : '已关闭', data.watchdogEnabled ? 'ok' : 'warn-text'),
        renderStatusCard('连续失败次数', String(data.failureCount)),
        renderStatusCard('最近动作', data.lastAction || '无'),
        renderStatusCard('最近巡检', data.lastCheckedAt || '无')
      ].join('');
      document.getElementById('kpi-dev').textContent = data.development && data.development.running ? '在线' : '离线';
      document.getElementById('kpi-prod').textContent = data.production && data.production.running ? '在线' : '离线';
      document.getElementById('kpi-cf').textContent = data.cloudflared && data.cloudflared.healthy ? '可访问' : (data.cloudflared && data.cloudflared.running ? '异常' : '掉线');
      const devVersion = data.release && data.release.developmentVersion ? data.release.developmentVersion : '--';
      const prodVersion = data.release && data.release.productionVersion ? data.release.productionVersion : '--';
      document.getElementById('dev-version').textContent = devVersion;
      document.getElementById('prod-version').textContent = prodVersion;
      document.getElementById('dev-version-hero').textContent = devVersion;
      document.getElementById('prod-version-hero').textContent = prodVersion;
      document.getElementById('dev-version-panel').textContent = devVersion;
      document.getElementById('prod-version-panel').textContent = prodVersion;
      const versionInput = document.getElementById('dev-version-input');
      if (versionInput && document.activeElement !== versionInput) {
        versionInput.value = devVersion;
      }
      document.getElementById('published-at').textContent = data.release && data.release.lastPublishedAt ? new Date(data.release.lastPublishedAt).toLocaleString() : '尚未发布';
      document.getElementById('dev-running').textContent = data.development && data.development.running ? '运行中' : '未运行';
      document.getElementById('prod-running').textContent = data.production && data.production.running ? '运行中' : '未运行';
      document.getElementById('dev-pid').textContent = data.development && data.development.pid ? String(data.development.pid) : '--';
      document.getElementById('prod-pid').textContent = data.production && data.production.pid ? String(data.production.pid) : '--';
      document.getElementById('dev-chip').textContent = data.development && data.development.running ? '开发版在线' : '开发版离线';
      document.getElementById('prod-chip').textContent = data.production && data.production.running ? '线上版在线' : '线上版离线';
      document.getElementById('autostart-chip').textContent = data.autostart && data.autostart.installed ? '已开启' : '未开启';
      document.getElementById('autostart-info').textContent = JSON.stringify(data.autostart || {}, null, 2);
    }

    async function loadNgrokLog() {
      const res = await fetch('/api/ngrok/log');
      const data = await res.text();
      document.getElementById('tunnel-log').textContent = data || 'ngrok 日志为空。';
    }

    async function loadCloudflaredLog() {
      const res = await fetch('/api/cloudflared/log');
      const data = await res.text();
      document.getElementById('tunnel-log').textContent = data || 'Cloudflared 日志为空。';
    }

    async function call(path, button) {
      const label = button?.dataset?.label || '执行操作';
      setBusy(true, label + '...');
      document.getElementById('result').textContent = withTimestamp(label + ' 中...');
      document.getElementById('publish-status').className = 'release-status neutral';
      try {
        const res = await fetch(path, { method: 'POST' });
        const data = await res.json();
        document.getElementById('result').textContent = withTimestamp(JSON.stringify(data, null, 2));
        if (path === '/api/release/publish') {
          document.getElementById('publish-status').className = data && data.ok ? 'release-status ok' : 'release-status bad';
          document.getElementById('publish-status').textContent = withTimestamp((data && data.ok ? '发布成功\\n' : '发布失败\\n') + JSON.stringify(data, null, 2));
        } else {
          document.getElementById('publish-status').className = data && data.ok ? 'release-status ok' : 'release-status bad';
          document.getElementById('publish-status').textContent = withTimestamp('最近一次操作\\n' + JSON.stringify(data, null, 2));
        }
      } catch (error) {
        document.getElementById('result').textContent = withTimestamp(JSON.stringify({ ok: false, error: error.message || '请求失败' }, null, 2));
        document.getElementById('publish-status').className = 'release-status bad';
        document.getElementById('publish-status').textContent = withTimestamp(JSON.stringify({ ok: false, error: error.message || '请求失败' }, null, 2));
      } finally {
        setBusy(false);
        await refresh();
        await loadCloudflaredLog();
      }
    }

    async function saveDevelopmentVersion(button) {
      const input = document.getElementById('dev-version-input');
      const developmentVersion = input && input.value ? input.value.trim() : '';
      if (!developmentVersion) {
        document.getElementById('result').textContent = withTimestamp(JSON.stringify({ ok: false, error: '开发版本号不能为空。' }, null, 2));
        return;
      }
      setBusy(true, '保存开发版号...');
      document.getElementById('result').textContent = withTimestamp('保存开发版号中...');
      document.getElementById('publish-status').className = 'release-status neutral';
      try {
        const res = await fetch('/api/release/development-version', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ developmentVersion })
        });
        const data = await res.json();
        document.getElementById('result').textContent = withTimestamp(JSON.stringify(data, null, 2));
        document.getElementById('publish-status').className = data && data.ok ? 'release-status ok' : 'release-status bad';
        document.getElementById('publish-status').textContent = withTimestamp((data && data.ok ? '开发版号已保存\\n' : '保存失败\\n') + JSON.stringify(data, null, 2));
      } catch (error) {
        document.getElementById('result').textContent = withTimestamp(JSON.stringify({ ok: false, error: error.message || '请求失败' }, null, 2));
        document.getElementById('publish-status').className = 'release-status bad';
        document.getElementById('publish-status').textContent = withTimestamp(JSON.stringify({ ok: false, error: error.message || '请求失败' }, null, 2));
      } finally {
        setBusy(false);
        await refresh();
      }
    }

    async function loadUsers() {
      try {
        const res = await fetch('/api/users');
        const users = await res.json();
        const rows = users.map((user) => '<tr>' +
          '<td>' + (user.name || '-') + '</td>' +
          '<td>' + (user.email || '-') + '</td>' +
          '<td><span class="pill ' + (user.role === 'admin' ? 'admin' : 'user') + '">' + user.role + '</span></td>' +
          '<td>' + (user.intervalsAthleteId || '-') + '</td>' +
          '<td>' + (user.weightKg ?? '-') + '</td>' +
          '<td>' + (user.ftp ?? '-') + '</td>' +
          '<td>' + (user.thresholdHr ?? '-') + '</td>' +
          '<td>' + (user.maxHr ?? '-') + '</td>' +
          '<td>' + (user.restingHr ?? '-') + '</td>' +
          '<td>' + (user.createdAt ? new Date(user.createdAt).toLocaleString() : '-') + '</td>' +
        '</tr>');
        document.getElementById('users-body').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="10" class="muted">还没有用户。</td></tr>';
      } catch (error) {
        document.getElementById('users-body').innerHTML = '<tr><td colspan="10" class="bad">读取用户失败：' + (error.message || 'unknown') + '</td></tr>';
      }
    }
    refresh();
    loadCloudflaredLog();
    loadUsers();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }

    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && req.url === "/api/status") {
      await writeJson(res, getStatus());
      return;
    }

    if (req.method === "GET" && req.url === "/api/ngrok/log") {
      let log = "";
      try {
        log = tailFile(ngrokLogPath);
      } catch {}
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(log || "ngrok 日志为空。");
      return;
    }

    if (req.method === "GET" && req.url === "/api/users") {
      await writeJson(res, listManagedUsers());
      return;
    }

    if (req.method === "POST" && req.url === "/api/start") {
      await writeJson(res, startProductionApp());
      return;
    }

    if (req.method === "POST" && req.url === "/api/stop") {
      await writeJson(res, stopProductionApp());
      return;
    }

    if (req.method === "POST" && req.url === "/api/restart") {
      await writeJson(res, restartProductionApp());
      return;
    }

    if (req.method === "POST" && req.url === "/api/rebuild-restart") {
      await writeJson(res, restartProductionApp({ rebuild: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/dev/start") {
      await writeJson(res, startDevelopmentApp());
      return;
    }

    if (req.method === "POST" && req.url === "/api/dev/stop") {
      await writeJson(res, stopDevelopmentApp());
      return;
    }

    if (req.method === "POST" && req.url === "/api/dev/restart") {
      await writeJson(res, restartDevelopmentApp());
      return;
    }

    if (req.method === "POST" && (req.url === "/api/tunnel/start" || req.url === "/api/cloudflared/start")) {
      await writeJson(res, startCloudflared());
      return;
    }

    if (req.method === "POST" && (req.url === "/api/tunnel/stop" || req.url === "/api/cloudflared/stop")) {
      await writeJson(res, stopCloudflared());
      return;
    }

    if (req.method === "POST" && req.url === "/api/ngrok/start") {
      await writeJson(res, startNgrok());
      return;
    }

    if (req.method === "POST" && req.url === "/api/ngrok/stop") {
      await writeJson(res, stopNgrok());
      return;
    }

    if (req.method === "GET" && req.url === "/api/cloudflared/status") {
      await writeJson(res, getCloudflaredStatus());
      return;
    }

    if (req.method === "GET" && (req.url === "/api/tunnel/log" || req.url === "/api/cloudflared/log")) {
      let log = "";
      try {
        const parts = [
          ["stdout", tailFile(cloudflaredLogPath, 40)],
          ["stderr", tailFile(cloudflaredErrPath, 80)],
          ["manager stdout", tailFile(cloudflaredManagerLogPath, 40)],
          ["manager stderr", tailFile(cloudflaredManagerErrPath, 80)],
          ["legacy stderr", tailFile(legacyCloudflaredErrPath, 40)],
        ].filter(([, content]) => content);
        log = parts.map(([label, content]) => `# ${label}\n${content}`).join("\n\n");
      } catch {}
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(log || "cloudflared 日志为空。");
      return;
    }

    if (req.method === "POST" && req.url === "/api/toggle-watchdog") {
      const state = readState();
      const next = { ...state, watchdogEnabled: !state.watchdogEnabled, lastAction: "toggle-watchdog", lastCheckedAt: new Date().toISOString() };
      writeState(next);
      await writeJson(res, Promise.resolve(next));
      return;
    }

    if (req.method === "POST" && req.url === "/api/autostart/install") {
      await writeJson(res, installAutostart());
      return;
    }

    if (req.method === "POST" && req.url === "/api/autostart/uninstall") {
      await writeJson(res, uninstallAutostart());
      return;
    }

    if (req.method === "POST" && req.url === "/api/release/publish") {
      await writeJson(res, publishRelease());
      return;
    }

    if (req.method === "POST" && req.url === "/api/release/development-version") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
      await writeJson(res, updateDevelopmentVersion(body.developmentVersion));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (error) {
    const state = readState();
    writeState({
      ...state,
      lastAction: `request-error:${error instanceof Error ? error.message : "unknown"}`,
      lastCheckedAt: new Date().toISOString(),
    });
    writeJsonError(res, error);
  }
});

server.listen(managerPort, "127.0.0.1", () => {
  console.log(`System manager running at http://127.0.0.1:${managerPort}`);
});
