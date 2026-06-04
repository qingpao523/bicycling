export type RideType =
  | "轻松骑"
  | "耐力骑"
  | "拉练"
  | "爬坡"
  | "间歇"
  | "比赛/高强度";

export type UserRole = "admin" | "user";
export type AuthMode = "invite_only" | "open_registration";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  weightKg?: number;
  ftp?: number;
  thresholdHr?: number;
  maxHr?: number;
  restingHr?: number;
  syncedWeightKg?: number;
  syncedFtp?: number;
  syncedThresholdHr?: number;
  syncedMaxHr?: number;
  syncedRestingHr?: number;
  intervalsAthleteId?: string;
  intervalsApiKeyEncrypted?: string;
  intervalsRawProfileJson?: Record<string, unknown>;
  intervalsRawWellnessJson?: Record<string, unknown>[] | Record<string, unknown>;
  stravaAthleteId?: string;
  stravaScopes?: string;
  stravaAuthSource?: "platform" | "personal";
  stravaAccessTokenEncrypted?: string;
  stravaRefreshTokenEncrypted?: string;
  stravaTokenExpiresAt?: string;
  stravaRawAthleteJson?: Record<string, unknown>;
  stravaPersonalClientId?: string;
  stravaPersonalClientSecretEncrypted?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export interface AppConfig {
  appName: string;
  authMode: AuthMode;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  featureRidePlans: boolean;
  featureRecovery: boolean;
  featureAiReview: boolean;
  featureIntervalsSync: boolean;
  aiEnabled: boolean;
  aiBaseUrl?: string;
  aiApiKeyEncrypted?: string;
  aiModel?: string;
  aiSystemPrompt?: string;
  developmentVersion: string;
  productionVersion: string;
  autoSyncEnabled: boolean;
  autoSyncIntervalHours: number;
  autoSyncIntervals: boolean;
  autoSyncStrava: boolean;
  autoSyncLastRunAt?: string;
  autoSyncLastStatus?: string;
  lastPublishedAt?: string;
  updatedAt: string;
}

export interface SyncJob {
  id: string;
  userId?: string;
  source: "intervals.icu" | "strava";
  jobType: "sync" | "delete" | "stream_backfill";
  status: "pending" | "processing" | "done" | "failed";
  reason?: string;
  externalRef?: string;
  payload?: Record<string, unknown>;
  availableAt: string;
  claimedAt?: string;
  processedAt?: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RidePlan {
  id: string;
  userId: string;
  distanceKm: number;
  elevationM: number;
  expectedSpeedKmh?: number;
  expectedDurationMin?: number;
  rideType: RideType;
  temperatureC?: number;
  isHotHumid: boolean;
  hasResupply: boolean;
  weightKg?: number;
  breakfastStatus: "已进食" | "空腹/未正式进食";
  fuelPreference: "只吃胶" | "胶+能量棒" | "可便利店补给";
  caffeineAccepted: boolean;
  notes?: string;
  createdAt: string;
}

export interface FuelPlan {
  id: string;
  ridePlanId: string;
  estimatedDurationMin: number;
  loadLevel: "低" | "中" | "高";
  strategyLevel: "轻量" | "标准" | "高补给";
  carbTargetGPerH: number;
  fluidTargetMlPerH: number;
  sodiumTargetMgPerH: number;
  gelCount: number;
  electrolyteBottleCount: number;
  summary: string;
  carryingList: string[];
  timeline: string[];
  riskFlags: string[];
  createdAt: string;
}

export interface Activity {
  id: string;
  userId: string;
  source: "intervals.icu" | "strava";
  externalActivityId: string;
  name: string;
  startTime: string;
  distanceKm: number;
  movingTimeMin: number;
  elevationM: number;
  avgSpeedKmh: number;
  avgHr?: number;
  avgPower?: number;
  np?: number;
  ifValue?: number;
  tss?: number;
  temperatureC?: number;
  recentCtl?: number;
  recentAtl?: number;
  recentForm?: number;
  rawSummaryJson: Record<string, unknown>;
  rawStreamsJson?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FuelLog {
  id: string;
  activityId: string;
  gelCountActual: number;
  doubleGelCountActual?: number;
  caffeineGelCountActual?: number;
  saltCapsuleCountActual?: number;
  carbOtherGrams?: number;
  waterMlActual: number;
  electrolyteUsed: boolean;
  carbOtherDesc?: string;
  fatigueScore: number;
  legFatigueScore: number;
  symptoms: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryAdvice {
  level: "低" | "中" | "高";
  recoveryWindow: "12h" | "24h" | "36h" | "48h+";
  summary: string;
  nutrition: string[];
  hydration: string[];
  warnings: string[];
  nextDay: string;
  fuelReview: string[];
}

export interface RideReview {
  oneLine: string;
  rideType: string;
  highlights: string[];
  problems: string[];
  causes: string[];
  nextAdvice: string[];
  engineFindings: string[];
}

export interface AiReport {
  id: string;
  activityId: string;
  userId: string;
  reviewText: string;
  recoveryText: string;
  fuelReviewText: string;
  model: string;
  generatedAt: string;
}

export type AiChatRole = "user" | "assistant";

export interface AiChatMessage {
  id: string;
  activityId: string;
  userId: string;
  role: AiChatRole;
  content: string;
  createdAt: string;
}

export interface Database {
  appConfig: AppConfig;
  users: User[];
  sessions: Session[];
  ridePlans: RidePlan[];
  fuelPlans: FuelPlan[];
  activities: Activity[];
  fuelLogs: FuelLog[];
  aiReports: AiReport[];
  aiChatMessages?: AiChatMessage[];
}
