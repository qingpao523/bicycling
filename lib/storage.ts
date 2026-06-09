import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import type {
  Activity,
  AiChatMessage,
  AiReport,
  AppConfig,
  Database,
  FuelLog,
  FuelPlan,
  RidePlan,
  Session,
  SyncJob,
  User,
} from "@/lib/types";

const seedPath = path.join(process.cwd(), "data", "seed.json");
const legacyJsonPath = path.join(process.cwd(), "data", "local-db.generated.json");

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function toAppConfig(record: {
  appName: string;
  authMode: string;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  featureRidePlans: boolean;
  featureRecovery: boolean;
  featureAiReview: boolean;
  featureIntervalsSync: boolean;
  aiEnabled: boolean;
  aiBaseUrl: string | null;
  aiApiKeyEncrypted: string | null;
  aiModel: string | null;
  aiSystemPrompt: string | null;
  developmentVersion: string;
  productionVersion: string;
  autoSyncEnabled: boolean;
  autoSyncIntervalHours: number;
  autoSyncIntervals: boolean;
  autoSyncStrava: boolean;
  autoSyncLastRunAt: Date | null;
  autoSyncLastStatus: string | null;
  lastPublishedAt: Date | null;
  updatedAt: Date;
}): AppConfig {
  return {
    appName: record.appName,
    authMode: record.authMode as AppConfig["authMode"],
    maintenanceMode: record.maintenanceMode,
    maintenanceMessage: record.maintenanceMessage ?? undefined,
    featureRidePlans: record.featureRidePlans,
    featureRecovery: record.featureRecovery,
    featureAiReview: record.featureAiReview,
    featureIntervalsSync: record.featureIntervalsSync,
    aiEnabled: record.aiEnabled,
    aiBaseUrl: record.aiBaseUrl ?? undefined,
    aiApiKeyEncrypted: record.aiApiKeyEncrypted ?? undefined,
    aiModel: record.aiModel ?? undefined,
    aiSystemPrompt: record.aiSystemPrompt ?? undefined,
    developmentVersion: record.developmentVersion,
    productionVersion: record.productionVersion,
    autoSyncEnabled: record.autoSyncEnabled,
    autoSyncIntervalHours: record.autoSyncIntervalHours,
    autoSyncIntervals: record.autoSyncIntervals,
    autoSyncStrava: record.autoSyncStrava,
    autoSyncLastRunAt: record.autoSyncLastRunAt?.toISOString() ?? undefined,
    autoSyncLastStatus: record.autoSyncLastStatus ?? undefined,
    lastPublishedAt: record.lastPublishedAt?.toISOString() ?? undefined,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toUser(record: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  weightKg: number | null;
  ftp: number | null;
  thresholdHr: number | null;
  maxHr: number | null;
  restingHr: number | null;
  syncedWeightKg: number | null;
  syncedFtp: number | null;
  syncedThresholdHr: number | null;
  syncedMaxHr: number | null;
  syncedRestingHr: number | null;
  intervalsAthleteId: string | null;
  intervalsApiKeyEncrypted: string | null;
  intervalsEmailEncrypted: string | null;
  intervalsPasswordEncrypted: string | null;
  intervalsRawProfileJson: string | null;
  intervalsRawWellnessJson: string | null;
  stravaAthleteId: string | null;
  stravaScopes: string | null;
  stravaAuthSource: string | null;
  stravaAccessTokenEncrypted: string | null;
  stravaRefreshTokenEncrypted: string | null;
  stravaTokenExpiresAt: Date | null;
  stravaRawAthleteJson: string | null;
  stravaPersonalClientId: string | null;
  stravaPersonalClientSecretEncrypted: string | null;
  userType: string;
  onboardingStatus: string;
  onboardingStepJson: string | null;
  timezone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  heightCm: number | null;
  primaryDevice: string | null;
  preferencesJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    passwordHash: record.passwordHash,
    role: record.role as User["role"],
    weightKg: record.weightKg ?? undefined,
    ftp: record.ftp ?? undefined,
    thresholdHr: record.thresholdHr ?? undefined,
    maxHr: record.maxHr ?? undefined,
    restingHr: record.restingHr ?? undefined,
    syncedWeightKg: record.syncedWeightKg ?? undefined,
    syncedFtp: record.syncedFtp ?? undefined,
    syncedThresholdHr: record.syncedThresholdHr ?? undefined,
    syncedMaxHr: record.syncedMaxHr ?? undefined,
    syncedRestingHr: record.syncedRestingHr ?? undefined,
    intervalsAthleteId: record.intervalsAthleteId ?? undefined,
    intervalsApiKeyEncrypted: record.intervalsApiKeyEncrypted ?? undefined,
    intervalsEmailEncrypted: record.intervalsEmailEncrypted ?? undefined,
    intervalsPasswordEncrypted: record.intervalsPasswordEncrypted ?? undefined,
    intervalsRawProfileJson: parseJson<Record<string, unknown>>(record.intervalsRawProfileJson, {}),
    intervalsRawWellnessJson: parseJson<Record<string, unknown>[] | Record<string, unknown>>(record.intervalsRawWellnessJson, []),
    stravaAthleteId: record.stravaAthleteId ?? undefined,
    stravaScopes: record.stravaScopes ?? undefined,
    stravaAuthSource: (record.stravaAuthSource as User["stravaAuthSource"]) ?? undefined,
    stravaAccessTokenEncrypted: record.stravaAccessTokenEncrypted ?? undefined,
    stravaRefreshTokenEncrypted: record.stravaRefreshTokenEncrypted ?? undefined,
    stravaTokenExpiresAt: record.stravaTokenExpiresAt?.toISOString() ?? undefined,
    stravaRawAthleteJson: parseJson<Record<string, unknown>>(record.stravaRawAthleteJson, {}),
    stravaPersonalClientId: record.stravaPersonalClientId ?? undefined,
    stravaPersonalClientSecretEncrypted: record.stravaPersonalClientSecretEncrypted ?? undefined,
    userType: record.userType ?? undefined,
    onboardingStatus: record.onboardingStatus ?? undefined,
    onboardingStepJson: record.onboardingStepJson ?? undefined,
    timezone: record.timezone ?? undefined,
    dateOfBirth: record.dateOfBirth ?? undefined,
    gender: record.gender ?? undefined,
    heightCm: record.heightCm ?? undefined,
    primaryDevice: record.primaryDevice ?? undefined,
    preferencesJson: record.preferencesJson ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toSession(record: { id: string; userId: string; expiresAt: Date; createdAt: Date }): Session {
  return {
    id: record.id,
    userId: record.userId,
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

function toSyncJob(record: {
  id: string;
  userId: string | null;
  source: string;
  jobType: string;
  status: string;
  reason: string | null;
  externalRef: string | null;
  payloadJson: string | null;
  availableAt: Date;
  claimedAt: Date | null;
  processedAt: Date | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SyncJob {
  return {
    id: record.id,
    userId: record.userId ?? undefined,
    source: record.source as SyncJob["source"],
    jobType: record.jobType as SyncJob["jobType"],
    status: record.status as SyncJob["status"],
    reason: record.reason ?? undefined,
    externalRef: record.externalRef ?? undefined,
    payload: parseJson<Record<string, unknown>>(record.payloadJson, {}),
    availableAt: record.availableAt.toISOString(),
    claimedAt: record.claimedAt?.toISOString() ?? undefined,
    processedAt: record.processedAt?.toISOString() ?? undefined,
    attempts: record.attempts,
    lastError: record.lastError ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toRidePlan(record: {
  id: string;
  userId: string;
  distanceKm: number;
  elevationM: number;
  expectedSpeedKmh: number | null;
  expectedDurationMin: number | null;
  rideType: string;
  temperatureC: number | null;
  isHotHumid: boolean;
  hasResupply: boolean;
  weightKg: number | null;
  breakfastStatus: string;
  fuelPreference: string;
  caffeineAccepted: boolean;
  notes: string | null;
  createdAt: Date;
}): RidePlan {
  return {
    id: record.id,
    userId: record.userId,
    distanceKm: record.distanceKm,
    elevationM: record.elevationM,
    expectedSpeedKmh: record.expectedSpeedKmh ?? undefined,
    expectedDurationMin: record.expectedDurationMin ?? undefined,
    rideType: record.rideType as RidePlan["rideType"],
    temperatureC: record.temperatureC ?? undefined,
    isHotHumid: record.isHotHumid,
    hasResupply: record.hasResupply,
    weightKg: record.weightKg ?? undefined,
    breakfastStatus: record.breakfastStatus as RidePlan["breakfastStatus"],
    fuelPreference: record.fuelPreference as RidePlan["fuelPreference"],
    caffeineAccepted: record.caffeineAccepted,
    notes: record.notes ?? undefined,
    createdAt: record.createdAt.toISOString(),
  };
}

function toFuelPlan(record: {
  id: string;
  ridePlanId: string;
  estimatedDurationMin: number;
  loadLevel: string;
  strategyLevel: string;
  carbTargetGPerH: number;
  fluidTargetMlPerH: number;
  sodiumTargetMgPerH: number;
  gelCount: number;
  electrolyteBottleCount: number;
  summary: string;
  carryingListJson: string;
  timelineJson: string;
  riskFlagsJson: string;
  createdAt: Date;
}): FuelPlan {
  return {
    id: record.id,
    ridePlanId: record.ridePlanId,
    estimatedDurationMin: record.estimatedDurationMin,
    loadLevel: record.loadLevel as FuelPlan["loadLevel"],
    strategyLevel: record.strategyLevel as FuelPlan["strategyLevel"],
    carbTargetGPerH: record.carbTargetGPerH,
    fluidTargetMlPerH: record.fluidTargetMlPerH,
    sodiumTargetMgPerH: record.sodiumTargetMgPerH,
    gelCount: record.gelCount,
    electrolyteBottleCount: record.electrolyteBottleCount,
    summary: record.summary,
    carryingList: parseJson<string[]>(record.carryingListJson, []),
    timeline: parseJson<string[]>(record.timelineJson, []),
    riskFlags: parseJson<string[]>(record.riskFlagsJson, []),
    createdAt: record.createdAt.toISOString(),
  };
}

function toActivity(record: {
  id: string;
  userId: string;
  source: string;
  externalActivityId: string;
  name: string;
  startTime: Date;
  distanceKm: number;
  movingTimeMin: number;
  elevationM: number;
  avgSpeedKmh: number;
  avgHr: number | null;
  avgPower: number | null;
  np: number | null;
  ifValue: number | null;
  tss: number | null;
  temperatureC: number | null;
  recentCtl: number | null;
  recentAtl: number | null;
  recentForm: number | null;
  rawSummaryJson: string;
  rawStreamsJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Activity {
  return {
    id: record.id,
    userId: record.userId,
    source: record.source as Activity["source"],
    externalActivityId: record.externalActivityId,
    name: record.name,
    startTime: record.startTime.toISOString(),
    distanceKm: record.distanceKm,
    movingTimeMin: record.movingTimeMin,
    elevationM: record.elevationM,
    avgSpeedKmh: record.avgSpeedKmh,
    avgHr: record.avgHr ?? undefined,
    avgPower: record.avgPower ?? undefined,
    np: record.np ?? undefined,
    ifValue: record.ifValue ?? undefined,
    tss: record.tss ?? undefined,
    temperatureC: record.temperatureC ?? undefined,
    recentCtl: record.recentCtl ?? undefined,
    recentAtl: record.recentAtl ?? undefined,
    recentForm: record.recentForm ?? undefined,
    rawSummaryJson: parseJson<Record<string, unknown>>(record.rawSummaryJson, {}),
    rawStreamsJson: parseJson<Record<string, unknown>>(record.rawStreamsJson, {}),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toFuelLog(record: {
  id: string;
  activityId: string;
  gelCountActual: number;
  doubleGelCountActual?: number | null;
  caffeineGelCountActual?: number | null;
  saltCapsuleCountActual?: number | null;
  carbOtherGrams?: number | null;
  waterMlActual: number;
  electrolyteUsed: boolean;
  carbOtherDesc: string | null;
  fatigueScore: number;
  legFatigueScore: number;
  symptomsJson: string;
  createdAt: Date;
  updatedAt: Date;
}): FuelLog {
  return {
    id: record.id,
    activityId: record.activityId,
    gelCountActual: record.gelCountActual,
    doubleGelCountActual: record.doubleGelCountActual ?? 0,
    caffeineGelCountActual: record.caffeineGelCountActual ?? 0,
    saltCapsuleCountActual: record.saltCapsuleCountActual ?? 0,
    carbOtherGrams: record.carbOtherGrams ?? 0,
    waterMlActual: record.waterMlActual,
    electrolyteUsed: record.electrolyteUsed,
    carbOtherDesc: record.carbOtherDesc ?? undefined,
    fatigueScore: record.fatigueScore,
    legFatigueScore: record.legFatigueScore,
    symptoms: parseJson<string[]>(record.symptomsJson, []),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toAiReport(record: {
  id: string;
  activityId: string;
  userId: string;
  reviewText: string;
  recoveryText: string;
  fuelReviewText: string;
  model: string;
  generatedAt: Date;
}): AiReport {
  return {
    id: record.id,
    activityId: record.activityId,
    userId: record.userId,
    reviewText: record.reviewText,
    recoveryText: record.recoveryText,
    fuelReviewText: record.fuelReviewText,
    model: record.model,
    generatedAt: record.generatedAt.toISOString(),
  };
}

function toAiChatMessage(record: {
  id: string;
  activityId: string;
  userId: string;
  role: string;
  content: string;
  createdAt: Date;
}): AiChatMessage {
  return {
    id: record.id,
    activityId: record.activityId,
    userId: record.userId,
    role: record.role as AiChatMessage["role"],
    content: record.content,
    createdAt: record.createdAt.toISOString(),
  };
}

async function getSeedConfig() {
  const raw = await fs.readFile(seedPath, "utf8");
  const seed = JSON.parse(raw) as Database;
  return seed.appConfig;
}

export async function ensureAppConfig() {
  const seedConfig = await getSeedConfig();
  const record = await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      appName: seedConfig.appName,
      authMode: seedConfig.authMode,
      maintenanceMode: seedConfig.maintenanceMode,
      maintenanceMessage: seedConfig.maintenanceMessage,
      featureRidePlans: seedConfig.featureRidePlans,
      featureRecovery: seedConfig.featureRecovery,
      featureAiReview: seedConfig.featureAiReview,
      featureIntervalsSync: seedConfig.featureIntervalsSync,
      aiEnabled: seedConfig.aiEnabled,
      aiBaseUrl: seedConfig.aiBaseUrl,
      aiApiKeyEncrypted: seedConfig.aiApiKeyEncrypted,
      aiModel: seedConfig.aiModel,
      aiSystemPrompt: seedConfig.aiSystemPrompt,
      developmentVersion: seedConfig.developmentVersion ?? "0.1.1-dev",
      productionVersion: seedConfig.productionVersion ?? "0.1.0",
      autoSyncEnabled: seedConfig.autoSyncEnabled ?? false,
      autoSyncIntervalHours: seedConfig.autoSyncIntervalHours ?? 6,
      autoSyncIntervals: seedConfig.autoSyncIntervals ?? true,
      autoSyncStrava: seedConfig.autoSyncStrava ?? true,
      autoSyncLastRunAt: seedConfig.autoSyncLastRunAt ? new Date(seedConfig.autoSyncLastRunAt) : null,
      autoSyncLastStatus: seedConfig.autoSyncLastStatus ?? null,
      lastPublishedAt: seedConfig.lastPublishedAt ? new Date(seedConfig.lastPublishedAt) : null,
      updatedAt: new Date(seedConfig.updatedAt),
    },
  });

  return toAppConfig(record);
}

export async function resetDbFromSeed() {
  await prisma.aiChatMessage.deleteMany();
  await prisma.aiReport.deleteMany();
  await prisma.fuelLog.deleteMany();
  await prisma.fuelPlan.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.ridePlan.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.appConfig.deleteMany();
  await ensureAppConfig();
}

export async function getLegacyJsonDb(): Promise<Database | null> {
  try {
    const raw = await fs.readFile(legacyJsonPath, "utf8");
    return JSON.parse(raw) as Database;
  } catch {
    return null;
  }
}

export function createId(prefix: string) {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

export async function enqueueSyncJob(input: {
  userId?: string;
  source: SyncJob["source"];
  jobType: SyncJob["jobType"];
  reason?: string;
  externalRef?: string;
  payload?: Record<string, unknown>;
  availableAt?: string;
}) {
  const now = new Date();
  const availableAt = input.availableAt ? new Date(input.availableAt) : now;
  const payloadJson = stringifyJson(input.payload);

  if (input.externalRef) {
    const existing = await prisma.syncJob.findFirst({
      where: {
        source: input.source,
        jobType: input.jobType,
        externalRef: input.externalRef,
      },
    });

    let record;
    if (existing) {
      record = await prisma.syncJob.update({
        where: { id: existing.id },
        data: {
          userId: input.userId ?? null,
          reason: input.reason,
          payloadJson,
          status: "pending",
          availableAt,
          claimedAt: null,
          processedAt: null,
          attempts: 0,
          lastError: null,
          updatedAt: now,
        },
      });
    } else {
      record = await prisma.syncJob.create({
        data: {
          id: createId("job"),
          userId: input.userId ?? null,
          source: input.source,
          jobType: input.jobType,
          status: "pending",
          reason: input.reason,
          externalRef: input.externalRef,
          payloadJson,
          availableAt,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    return toSyncJob(record);
  }

  const record = await prisma.syncJob.create({
    data: {
      id: createId("job"),
      userId: input.userId ?? null,
      source: input.source,
      jobType: input.jobType,
      status: "pending",
      reason: input.reason,
      externalRef: null,
      payloadJson,
      availableAt,
      createdAt: now,
      updatedAt: now,
    },
  });

  return toSyncJob(record);
}

export async function claimAvailableSyncJobs(limit = 10) {
  const now = new Date();
  const candidates = await prisma.syncJob.findMany({
    where: {
      status: "pending",
      availableAt: { lte: now },
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  const claimed: SyncJob[] = [];
  for (const candidate of candidates) {
    const result = await prisma.syncJob.updateMany({
      where: {
        id: candidate.id,
        status: "pending",
      },
      data: {
        status: "processing",
        claimedAt: now,
        attempts: { increment: 1 },
        updatedAt: now,
      },
    });
    if (result.count > 0) {
      const record = await prisma.syncJob.findUnique({ where: { id: candidate.id } });
      if (record) claimed.push(toSyncJob(record));
    }
  }

  return claimed;
}

export async function markSyncJobDone(jobId: string) {
  const record = await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: "done",
      processedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    },
  });

  return toSyncJob(record);
}

export async function markSyncJobFailed(jobId: string, error: string, retryAt?: string) {
  const existing = await prisma.syncJob.findUnique({ where: { id: jobId } });
  const attempts = (existing?.attempts ?? 0);

  // 超过 5 次重试 → 永久标记失败
  if (attempts >= 5) {
    const record = await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        lastError: `[${attempts} 次重试后放弃] ${error}`,
        updatedAt: new Date(),
      },
    });
    return toSyncJob(record);
  }

  const nextAvailableAt = retryAt ? new Date(retryAt) : new Date(Date.now() + 15 * 60 * 1000);
  const record = await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      availableAt: nextAvailableAt,
      claimedAt: null,
      lastError: error,
      updatedAt: new Date(),
    },
  });

  return toSyncJob(record);
}

export async function listPendingSyncJobs(source?: SyncJob["source"]) {
  return (
    await prisma.syncJob.findMany({
      where: {
        status: { in: ["pending", "processing"] },
        source,
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    })
  ).map(toSyncJob);
}

export async function listActivityAliasesByUser(userId: string) {
  return await prisma.activityAlias.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listActivityAliasesByActivityId(activityId: string) {
  return await prisma.activityAlias.findMany({
    where: { activityId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getLatestActivityAliasStartTime(userId: string, source: string) {
  const record = await prisma.activityAlias.findFirst({
    where: { userId, source },
    orderBy: { startTime: "desc" },
    select: { startTime: true },
  });

  return record?.startTime.toISOString();
}

export async function saveActivityAlias(input: {
  userId: string;
  activityId: string;
  source: string;
  externalActivityId: string;
  startTime: string;
  rawSummaryJson: Record<string, unknown>;
}) {
  const existing = await prisma.activityAlias.findFirst({
    where: {
      userId: input.userId,
      source: input.source,
      externalActivityId: input.externalActivityId,
    },
  });

  if (existing) {
    return await prisma.activityAlias.update({
      where: { id: existing.id },
      data: {
        activityId: input.activityId,
        startTime: new Date(input.startTime),
        rawSummaryJson: stringifyJson(input.rawSummaryJson),
        updatedAt: new Date(),
      },
    });
  }

  return await prisma.activityAlias.create({
    data: {
      id: createId("aal"),
      userId: input.userId,
      activityId: input.activityId,
      source: input.source,
      externalActivityId: input.externalActivityId,
      startTime: new Date(input.startTime),
      rawSummaryJson: stringifyJson(input.rawSummaryJson),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function getAppConfig(): Promise<AppConfig> {
  return ensureAppConfig();
}

export async function updateAppConfig(patch: Partial<AppConfig>) {
  await ensureAppConfig();
  const updated = await prisma.appConfig.update({
    where: { id: 1 },
    data: {
      appName: patch.appName,
      authMode: patch.authMode,
      maintenanceMode: patch.maintenanceMode,
      maintenanceMessage: patch.maintenanceMessage,
      featureRidePlans: patch.featureRidePlans,
      featureRecovery: patch.featureRecovery,
      featureAiReview: patch.featureAiReview,
      featureIntervalsSync: patch.featureIntervalsSync,
      aiEnabled: patch.aiEnabled,
      aiBaseUrl: patch.aiBaseUrl,
      aiApiKeyEncrypted: patch.aiApiKeyEncrypted,
      aiModel: patch.aiModel,
      aiSystemPrompt: patch.aiSystemPrompt,
      developmentVersion: patch.developmentVersion,
      productionVersion: patch.productionVersion,
      autoSyncEnabled: patch.autoSyncEnabled,
      autoSyncIntervalHours: patch.autoSyncIntervalHours,
      autoSyncIntervals: patch.autoSyncIntervals,
      autoSyncStrava: patch.autoSyncStrava,
      autoSyncLastRunAt: patch.autoSyncLastRunAt ? new Date(patch.autoSyncLastRunAt) : undefined,
      autoSyncLastStatus: patch.autoSyncLastStatus,
      lastPublishedAt: patch.lastPublishedAt ? new Date(patch.lastPublishedAt) : undefined,
      updatedAt: new Date(),
    },
  });
  return toAppConfig(updated);
}

export async function listUsers() {
  return (await prisma.user.findMany({ orderBy: { createdAt: "asc" } })).map(toUser);
}

export async function getUserById(userId: string) {
  const record = await prisma.user.findUnique({ where: { id: userId } });
  return record ? toUser(record) : undefined;
}

export async function getUserByStravaAthleteId(stravaAthleteId: string) {
  const record = await prisma.user.findFirst({ where: { stravaAthleteId } });
  return record ? toUser(record) : undefined;
}

export async function getUserByEmail(email: string) {
  const record = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  return record ? toUser(record) : undefined;
}

export async function listUsersWithRecentActivity(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return (
    await prisma.user.findMany({
      where: {
        activities: {
          some: {
            startTime: {
              gte: since,
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })
  ).map(toUser);
}

export async function hasAnyUser() {
  return (await prisma.user.count()) > 0;
}

export async function saveUser(user: User) {
  const record = await prisma.user.upsert({
    where: { id: user.id },
    update: {
      name: user.name,
      email: user.email.toLowerCase(),
      passwordHash: user.passwordHash,
      role: user.role,
      weightKg: user.weightKg,
      ftp: user.ftp,
      thresholdHr: user.thresholdHr,
      maxHr: user.maxHr,
      restingHr: user.restingHr,
      syncedWeightKg: user.syncedWeightKg,
      syncedFtp: user.syncedFtp,
      syncedThresholdHr: user.syncedThresholdHr,
      syncedMaxHr: user.syncedMaxHr,
      syncedRestingHr: user.syncedRestingHr,
      intervalsAthleteId: user.intervalsAthleteId,
      intervalsApiKeyEncrypted: user.intervalsApiKeyEncrypted,
      intervalsEmailEncrypted: user.intervalsEmailEncrypted,
      intervalsPasswordEncrypted: user.intervalsPasswordEncrypted,
      intervalsRawProfileJson: stringifyJson(user.intervalsRawProfileJson),
      intervalsRawWellnessJson: stringifyJson(user.intervalsRawWellnessJson),
      stravaAthleteId: user.stravaAthleteId,
      stravaScopes: user.stravaScopes,
      stravaAuthSource: user.stravaAuthSource,
      stravaAccessTokenEncrypted: user.stravaAccessTokenEncrypted,
      stravaRefreshTokenEncrypted: user.stravaRefreshTokenEncrypted,
      stravaTokenExpiresAt: user.stravaTokenExpiresAt ? new Date(user.stravaTokenExpiresAt) : null,
      stravaRawAthleteJson: stringifyJson(user.stravaRawAthleteJson),
      stravaPersonalClientId: user.stravaPersonalClientId,
      stravaPersonalClientSecretEncrypted: user.stravaPersonalClientSecretEncrypted,
      userType: user.userType,
      onboardingStatus: user.onboardingStatus,
      onboardingStepJson: user.onboardingStepJson,
      timezone: user.timezone,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      heightCm: user.heightCm,
      primaryDevice: user.primaryDevice,
      preferencesJson: user.preferencesJson,
      updatedAt: new Date(user.updatedAt),
    },
    create: {
      id: user.id,
      name: user.name,
      email: user.email.toLowerCase(),
      passwordHash: user.passwordHash,
      role: user.role,
      weightKg: user.weightKg,
      ftp: user.ftp,
      thresholdHr: user.thresholdHr,
      maxHr: user.maxHr,
      restingHr: user.restingHr,
      syncedWeightKg: user.syncedWeightKg,
      syncedFtp: user.syncedFtp,
      syncedThresholdHr: user.syncedThresholdHr,
      syncedMaxHr: user.syncedMaxHr,
      syncedRestingHr: user.syncedRestingHr,
      intervalsAthleteId: user.intervalsAthleteId,
      intervalsApiKeyEncrypted: user.intervalsApiKeyEncrypted,
      intervalsEmailEncrypted: user.intervalsEmailEncrypted,
      intervalsPasswordEncrypted: user.intervalsPasswordEncrypted,
      intervalsRawProfileJson: stringifyJson(user.intervalsRawProfileJson),
      intervalsRawWellnessJson: stringifyJson(user.intervalsRawWellnessJson),
      stravaAthleteId: user.stravaAthleteId,
      stravaScopes: user.stravaScopes,
      stravaAuthSource: user.stravaAuthSource,
      stravaAccessTokenEncrypted: user.stravaAccessTokenEncrypted,
      stravaRefreshTokenEncrypted: user.stravaRefreshTokenEncrypted,
      stravaTokenExpiresAt: user.stravaTokenExpiresAt ? new Date(user.stravaTokenExpiresAt) : null,
      stravaRawAthleteJson: stringifyJson(user.stravaRawAthleteJson),
      stravaPersonalClientId: user.stravaPersonalClientId,
      stravaPersonalClientSecretEncrypted: user.stravaPersonalClientSecretEncrypted,
      userType: user.userType,
      onboardingStatus: user.onboardingStatus,
      onboardingStepJson: user.onboardingStepJson,
      timezone: user.timezone,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      heightCm: user.heightCm,
      primaryDevice: user.primaryDevice,
      preferencesJson: user.preferencesJson,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    },
  });
  return toUser(record);
}

export async function saveSession(session: Session) {
  await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  const record = await prisma.session.upsert({
    where: { id: session.id },
    update: {
      userId: session.userId,
      expiresAt: new Date(session.expiresAt),
      createdAt: new Date(session.createdAt),
    },
    create: {
      id: session.id,
      userId: session.userId,
      expiresAt: new Date(session.expiresAt),
      createdAt: new Date(session.createdAt),
    },
  });
  return toSession(record);
}

export async function getSession(sessionId: string) {
  const record = await prisma.session.findFirst({
    where: {
      id: sessionId,
      expiresAt: { gt: new Date() },
    },
  });
  return record ? toSession(record) : undefined;
}

export async function deleteSession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function listRidePlansByUser(userId: string) {
  return (
    await prisma.ridePlan.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })
  ).map(toRidePlan);
}

export async function listFuelPlansByUser(userId: string) {
  return (
    await prisma.fuelPlan.findMany({
      where: { ridePlan: { userId } },
      orderBy: { createdAt: "desc" },
    })
  ).map(toFuelPlan);
}

export async function listActivitiesByUser(userId: string) {
  return (
    await prisma.activity.findMany({
      where: { userId },
      orderBy: { startTime: "desc" },
    })
  ).map(toActivity);
}

export async function getRidePlan(id: string) {
  const record = await prisma.ridePlan.findUnique({ where: { id } });
  return record ? toRidePlan(record) : undefined;
}

export async function getFuelPlanByRidePlanId(ridePlanId: string) {
  const record = await prisma.fuelPlan.findUnique({ where: { ridePlanId } });
  return record ? toFuelPlan(record) : undefined;
}

export async function getActivity(id: string) {
  const record = await prisma.activity.findUnique({ where: { id } });
  return record ? toActivity(record) : undefined;
}

export async function findActivityByExternalRef(userId: string, externalActivityId: string) {
  const record = await prisma.activity.findUnique({
    where: {
      userId_externalActivityId: {
        userId,
        externalActivityId,
      },
    },
  });
  return record ? toActivity(record) : undefined;
}

export async function deleteStravaActivityByExternalRef(userId: string, externalActivityId: string) {
  const alias = await prisma.activityAlias.findFirst({
    where: {
      userId,
      source: "strava",
      externalActivityId,
    },
  });

  if (alias) {
    await prisma.activityAlias.delete({ where: { id: alias.id } });
    const linkedActivity = await prisma.activity.findUnique({ where: { id: alias.activityId } });
    if (linkedActivity?.source === "strava" && linkedActivity.externalActivityId === externalActivityId) {
      await prisma.activity.delete({ where: { id: linkedActivity.id } });
      return { deletedActivityId: linkedActivity.id, deletedAliasId: alias.id };
    }
    return { deletedAliasId: alias.id };
  }

  const activity = await prisma.activity.findUnique({
    where: {
      userId_externalActivityId: {
        userId,
        externalActivityId,
      },
    },
  });
  if (!activity) return {};
  await prisma.activity.delete({ where: { id: activity.id } });
  return { deletedActivityId: activity.id };
}

export async function updateActivityStreams(activityId: string, rawStreamsJson: Record<string, unknown>) {
  const record = await prisma.activity.update({
    where: { id: activityId },
    data: {
      rawStreamsJson: stringifyJson(rawStreamsJson),
      updatedAt: new Date(),
    },
  });

  return toActivity(record);
}

export async function getFuelLogByActivityId(activityId: string) {
  const record = await prisma.fuelLog.findUnique({ where: { activityId } });
  return record ? toFuelLog(record) : undefined;
}

export async function listFuelLogsByActivityIds(activityIds: string[]) {
  if (!activityIds.length) return [];
  return (
    await prisma.fuelLog.findMany({
      where: { activityId: { in: activityIds } },
      orderBy: { updatedAt: "desc" },
    })
  ).map(toFuelLog);
}

export async function getAiReportByActivityId(activityId: string) {
  const record = await prisma.aiReport.findUnique({ where: { activityId } });
  return record ? toAiReport(record) : undefined;
}

export async function listAiReportsByActivityIds(activityIds: string[]) {
  if (!activityIds.length) return [];
  return (
    await prisma.aiReport.findMany({
      where: { activityId: { in: activityIds } },
      orderBy: { generatedAt: "desc" },
    })
  ).map(toAiReport);
}

export async function listAiChatMessagesByActivityId(activityId: string) {
  return (
    await prisma.aiChatMessage.findMany({
      where: { activityId },
      orderBy: { createdAt: "asc" },
    })
  ).map(toAiChatMessage);
}

export async function saveRidePlanAndFuelPlan(ridePlan: RidePlan, fuelPlan: FuelPlan) {
  await prisma.$transaction([
    prisma.ridePlan.create({
      data: {
        id: ridePlan.id,
        userId: ridePlan.userId,
        distanceKm: ridePlan.distanceKm,
        elevationM: ridePlan.elevationM,
        expectedSpeedKmh: ridePlan.expectedSpeedKmh,
        expectedDurationMin: ridePlan.expectedDurationMin,
        rideType: ridePlan.rideType,
        temperatureC: ridePlan.temperatureC,
        isHotHumid: ridePlan.isHotHumid,
        hasResupply: ridePlan.hasResupply,
        weightKg: ridePlan.weightKg,
        breakfastStatus: ridePlan.breakfastStatus,
        fuelPreference: ridePlan.fuelPreference,
        caffeineAccepted: ridePlan.caffeineAccepted,
        notes: ridePlan.notes,
        createdAt: new Date(ridePlan.createdAt),
      },
    }),
    prisma.fuelPlan.create({
      data: {
        id: fuelPlan.id,
        ridePlanId: fuelPlan.ridePlanId,
        estimatedDurationMin: fuelPlan.estimatedDurationMin,
        loadLevel: fuelPlan.loadLevel,
        strategyLevel: fuelPlan.strategyLevel,
        carbTargetGPerH: fuelPlan.carbTargetGPerH,
        fluidTargetMlPerH: fuelPlan.fluidTargetMlPerH,
        sodiumTargetMgPerH: fuelPlan.sodiumTargetMgPerH,
        gelCount: fuelPlan.gelCount,
        electrolyteBottleCount: fuelPlan.electrolyteBottleCount,
        summary: fuelPlan.summary,
        carryingListJson: stringifyJson(fuelPlan.carryingList),
        timelineJson: stringifyJson(fuelPlan.timeline),
        riskFlagsJson: stringifyJson(fuelPlan.riskFlags),
        createdAt: new Date(fuelPlan.createdAt),
      },
    }),
  ]);
}

export async function saveFuelLog(fuelLog: FuelLog) {
  await prisma.fuelLog.upsert({
    where: { activityId: fuelLog.activityId },
    update: {
      gelCountActual: fuelLog.gelCountActual,
      doubleGelCountActual: fuelLog.doubleGelCountActual ?? 0,
      caffeineGelCountActual: fuelLog.caffeineGelCountActual ?? 0,
      saltCapsuleCountActual: fuelLog.saltCapsuleCountActual ?? 0,
      carbOtherGrams: fuelLog.carbOtherGrams ?? 0,
      waterMlActual: fuelLog.waterMlActual,
      electrolyteUsed: fuelLog.electrolyteUsed,
      carbOtherDesc: fuelLog.carbOtherDesc,
      fatigueScore: fuelLog.fatigueScore,
      legFatigueScore: fuelLog.legFatigueScore,
      symptomsJson: stringifyJson(fuelLog.symptoms),
      updatedAt: new Date(fuelLog.updatedAt),
    },
    create: {
      id: fuelLog.id,
      activityId: fuelLog.activityId,
      gelCountActual: fuelLog.gelCountActual,
      doubleGelCountActual: fuelLog.doubleGelCountActual ?? 0,
      caffeineGelCountActual: fuelLog.caffeineGelCountActual ?? 0,
      saltCapsuleCountActual: fuelLog.saltCapsuleCountActual ?? 0,
      carbOtherGrams: fuelLog.carbOtherGrams ?? 0,
      waterMlActual: fuelLog.waterMlActual,
      electrolyteUsed: fuelLog.electrolyteUsed,
      carbOtherDesc: fuelLog.carbOtherDesc,
      fatigueScore: fuelLog.fatigueScore,
      legFatigueScore: fuelLog.legFatigueScore,
      symptomsJson: stringifyJson(fuelLog.symptoms),
      createdAt: new Date(fuelLog.createdAt),
      updatedAt: new Date(fuelLog.updatedAt),
    },
  });
}

export async function upsertActivities(activities: Activity[]) {
  for (const activity of activities) {
    const existing = await prisma.activity.findFirst({
      where: {
        userId: activity.userId,
        externalActivityId: activity.externalActivityId,
      },
    });

    let record;
    if (existing) {
      record = await prisma.activity.update({
        where: { id: existing.id },
        data: {
          source: activity.source,
          name: activity.name,
          startTime: new Date(activity.startTime),
          distanceKm: activity.distanceKm,
          movingTimeMin: activity.movingTimeMin,
          elevationM: activity.elevationM,
          avgSpeedKmh: activity.avgSpeedKmh,
          avgHr: activity.avgHr,
          avgPower: activity.avgPower,
          np: activity.np,
          ifValue: activity.ifValue,
          tss: activity.tss,
          temperatureC: activity.temperatureC,
          recentCtl: activity.recentCtl,
          recentAtl: activity.recentAtl,
          recentForm: activity.recentForm,
          rawSummaryJson: stringifyJson(activity.rawSummaryJson),
          rawStreamsJson: stringifyJson(activity.rawStreamsJson),
          updatedAt: new Date(activity.updatedAt),
        },
      });
    } else {
      record = await prisma.activity.create({
        data: {
          id: activity.id,
          userId: activity.userId,
          source: activity.source,
          externalActivityId: activity.externalActivityId,
          name: activity.name,
          startTime: new Date(activity.startTime),
          distanceKm: activity.distanceKm,
          movingTimeMin: activity.movingTimeMin,
          elevationM: activity.elevationM,
          avgSpeedKmh: activity.avgSpeedKmh,
          avgHr: activity.avgHr,
          avgPower: activity.avgPower,
          np: activity.np,
          ifValue: activity.ifValue,
          tss: activity.tss,
          temperatureC: activity.temperatureC,
          recentCtl: activity.recentCtl,
          recentAtl: activity.recentAtl,
          recentForm: activity.recentForm,
          rawSummaryJson: stringifyJson(activity.rawSummaryJson),
          rawStreamsJson: stringifyJson(activity.rawStreamsJson),
          createdAt: new Date(activity.createdAt),
          updatedAt: new Date(activity.updatedAt),
        },
      });
    }

    await saveActivityAlias({
      userId: activity.userId,
      activityId: record.id,
      source: activity.source,
      externalActivityId: activity.externalActivityId,
      startTime: activity.startTime,
      rawSummaryJson: activity.rawSummaryJson,
    });
  }
  revalidateTag("activities");
}

export async function saveAiReport(report: AiReport) {
  const existing = await prisma.aiReport.findUnique({
    where: { activityId: report.activityId },
  });

  let record;
  if (existing) {
    record = await prisma.aiReport.update({
      where: { activityId: report.activityId },
      data: {
        userId: report.userId,
        reviewText: report.reviewText,
        recoveryText: report.recoveryText,
        fuelReviewText: report.fuelReviewText,
        model: report.model,
        generatedAt: new Date(report.generatedAt),
      },
    });
  } else {
    record = await prisma.aiReport.create({
      data: {
        id: report.id,
        activityId: report.activityId,
        userId: report.userId,
        reviewText: report.reviewText,
        recoveryText: report.recoveryText,
        fuelReviewText: report.fuelReviewText,
        model: report.model,
        generatedAt: new Date(report.generatedAt),
      },
    });
  }
  return toAiReport(record);
}

export async function saveAiChatMessages(messages: AiChatMessage[]) {
  if (!messages.length) return [];

  const records = await prisma.$transaction(
    messages.map((message) =>
      prisma.aiChatMessage.create({
        data: {
          id: message.id,
          activityId: message.activityId,
          userId: message.userId,
          role: message.role,
          content: message.content,
          createdAt: new Date(message.createdAt),
        },
      }),
    ),
  );

  return records.map(toAiChatMessage);
}

// ===== Segment CRUD =====

export async function upsertSegment(data: {
  stravaSegmentId: number;
  name: string;
  distance: number;
  averageGrade: number;
  maximumGrade?: number;
  elevationHigh?: number;
  elevationLow?: number;
  climbCategory: number;
  city?: string;
  state?: string;
  country?: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  totalElevationGain?: number;
  tags?: string[];
}) {
  const now = new Date();
  const existing = await prisma.segment.findUnique({ where: { stravaSegmentId: data.stravaSegmentId } });

  if (existing) {
    return await prisma.segment.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        distance: data.distance,
        averageGrade: data.averageGrade,
        maximumGrade: data.maximumGrade,
        elevationHigh: data.elevationHigh,
        elevationLow: data.elevationLow,
        climbCategory: data.climbCategory,
        city: data.city,
        state: data.state,
        country: data.country,
        startLat: data.startLat,
        startLng: data.startLng,
        endLat: data.endLat,
        endLng: data.endLng,
        totalElevationGain: data.totalElevationGain,
        tagsJson: data.tags ? JSON.stringify(data.tags) : undefined,
        updatedAt: now,
      },
    });
  }

  return await prisma.segment.create({
    data: {
      id: createId("seg"),
      stravaSegmentId: data.stravaSegmentId,
      name: data.name,
      distance: data.distance,
      averageGrade: data.averageGrade,
      maximumGrade: data.maximumGrade,
      elevationHigh: data.elevationHigh,
      elevationLow: data.elevationLow,
      climbCategory: data.climbCategory,
      city: data.city,
      state: data.state,
      country: data.country,
      startLat: data.startLat,
      startLng: data.startLng,
      endLat: data.endLat,
      endLng: data.endLng,
      totalElevationGain: data.totalElevationGain,
      tagsJson: data.tags ? JSON.stringify(data.tags) : null,
      createdAt: now,
      updatedAt: now,
    },
  });
}

export async function upsertSegmentEffort(data: {
  segmentId: string;
  activityId: string;
  userId: string;
  stravaEffortId: bigint;
  elapsedTime: number;
  movingTime: number;
  startDate: string;
  averageWatts?: number;
  averageHr?: number;
  maxHr?: number;
  prRank?: number;
  komRank?: number;
  achievements?: unknown[];
  deviceWatts?: boolean;
}) {
  const existing = await prisma.segmentEffort.findUnique({ where: { stravaEffortId: data.stravaEffortId } });

  if (existing) {
    return await prisma.segmentEffort.update({
      where: { id: existing.id },
      data: {
        elapsedTime: data.elapsedTime,
        movingTime: data.movingTime,
        averageWatts: data.averageWatts,
        averageHr: data.averageHr,
        maxHr: data.maxHr,
        prRank: data.prRank,
        komRank: data.komRank,
        achievementsJson: data.achievements ? JSON.stringify(data.achievements) : undefined,
        deviceWatts: data.deviceWatts,
      },
    });
  }

  return await prisma.segmentEffort.create({
    data: {
      id: createId("sef"),
      segmentId: data.segmentId,
      activityId: data.activityId,
      userId: data.userId,
      stravaEffortId: data.stravaEffortId,
      elapsedTime: data.elapsedTime,
      movingTime: data.movingTime,
      startDate: new Date(data.startDate),
      averageWatts: data.averageWatts,
      averageHr: data.averageHr,
      maxHr: data.maxHr,
      prRank: data.prRank,
      komRank: data.komRank,
      achievementsJson: data.achievements ? JSON.stringify(data.achievements) : null,
      deviceWatts: data.deviceWatts,
      createdAt: new Date(),
    },
  });
}

export async function listSegmentEffortsByActivity(activityId: string) {
  return await prisma.segmentEffort.findMany({
    where: { activityId },
    include: { segment: true },
    orderBy: { startDate: "asc" },
  });
}

export async function listSegmentEffortsBySegment(segmentId: string, userId: string) {
  return await prisma.segmentEffort.findMany({
    where: { segmentId, userId },
    include: { activity: { select: { id: true, name: true, startTime: true } } },
    orderBy: { startDate: "desc" },
  });
}

export async function listUserSegments(userId: string) {
  const efforts = await prisma.segmentEffort.findMany({
    where: { userId },
    select: { segmentId: true },
    distinct: ["segmentId"],
  });
  const segmentIds = efforts.map((e) => e.segmentId);
  if (!segmentIds.length) return [];
  return await prisma.segment.findMany({
    where: { id: { in: segmentIds } },
    orderBy: { name: "asc" },
  });
}

export async function listAllSegmentEffortsByUser(userId: string) {
  return await prisma.segmentEffort.findMany({
    where: { userId },
    include: { segment: true },
    orderBy: { startDate: "desc" },
  });
}

export async function countActivitiesWithSegments(userId: string) {
  const result = await prisma.segmentEffort.findMany({
    where: { userId },
    select: { activityId: true },
    distinct: ["activityId"],
  });
  return result.length;
}

export async function countActivitiesWithoutSegments(userId: string) {
  const total = await prisma.activity.count({ where: { userId } });
  const withSegments = await countActivitiesWithSegments(userId);
  return Math.max(0, total - withSegments);
}

export async function listDailyWellness(userId: string, days: number = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return prisma.dailyWellness.findMany({
    where: { userId, date: { gte: cutoff } },
    orderBy: { date: "desc" },
  });
}

// === Race Plan ===

export async function createRacePlan(input: {
  userId: string;
  name: string;
  routeJson: string;
  gpxFileName?: string;
  weatherNote?: string;
  raceDate?: string;
}) {
  return prisma.racePlan.create({
    data: {
      userId: input.userId,
      name: input.name,
      routeJson: input.routeJson,
      gpxFileName: input.gpxFileName,
      weatherNote: input.weatherNote,
      raceDate: input.raceDate,
    },
    include: { riders: true },
  });
}

export async function getRacePlan(id: string) {
  return prisma.racePlan.findUnique({
    where: { id },
    include: { riders: true },
  });
}

export async function listRacePlans(userId: string) {
  return prisma.racePlan.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { riders: true },
  });
}

export async function updateRacePlanTactics(id: string, tacticsJson: string) {
  return prisma.racePlan.update({
    where: { id },
    data: { tacticsJson, status: "generated", updatedAt: new Date() },
  });
}

export async function addRacePlanRider(input: {
  racePlanId: string;
  role: string;
  name: string;
  ftp?: number;
  weightKg?: number;
  wpKg5min?: number;
  wpKg1min?: number;
  strength?: string;
  weakness?: string;
  note?: string;
}) {
  return prisma.racePlanRider.create({ data: input });
}

export async function removeRacePlanRider(id: string) {
  return prisma.racePlanRider.delete({ where: { id } });
}

export async function deleteRacePlan(id: string) {
  return prisma.racePlan.delete({ where: { id } });
}

export async function upsertDailyWellnessTag(
  userId: string,
  date: string,
  statusTag: string | null,
  note?: string,
) {
  return prisma.dailyWellness.upsert({
    where: { userId_date: { userId, date } },
    update: { statusTag, note, updatedAt: new Date() },
    create: { userId, date, statusTag, note },
  });
}
