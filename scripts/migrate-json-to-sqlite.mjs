import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const sourcePath = path.join(process.cwd(), "data", "local-db.generated.json");

function parseDate(value) {
  return value ? new Date(value) : new Date();
}

function json(value) {
  return JSON.stringify(value ?? null);
}

async function main() {
  if (!existsSync(sourcePath)) {
    console.log("No legacy JSON file found, skipping migration.");
    return;
  }

  const db = JSON.parse(readFileSync(sourcePath, "utf8"));

  if (db.appConfig) {
    await prisma.appConfig.upsert({
      where: { id: 1 },
      update: {
        appName: db.appConfig.appName,
        authMode: db.appConfig.authMode,
        maintenanceMode: db.appConfig.maintenanceMode ?? false,
        maintenanceMessage: db.appConfig.maintenanceMessage ?? null,
        featureRidePlans: db.appConfig.featureRidePlans,
        featureRecovery: db.appConfig.featureRecovery,
        featureAiReview: db.appConfig.featureAiReview,
        featureIntervalsSync: db.appConfig.featureIntervalsSync,
        aiEnabled: db.appConfig.aiEnabled,
        aiBaseUrl: db.appConfig.aiBaseUrl,
        aiApiKeyEncrypted: db.appConfig.aiApiKeyEncrypted,
        aiModel: db.appConfig.aiModel,
        aiSystemPrompt: db.appConfig.aiSystemPrompt,
        updatedAt: parseDate(db.appConfig.updatedAt),
      },
      create: {
        id: 1,
        appName: db.appConfig.appName,
        authMode: db.appConfig.authMode,
        maintenanceMode: db.appConfig.maintenanceMode ?? false,
        maintenanceMessage: db.appConfig.maintenanceMessage ?? null,
        featureRidePlans: db.appConfig.featureRidePlans,
        featureRecovery: db.appConfig.featureRecovery,
        featureAiReview: db.appConfig.featureAiReview,
        featureIntervalsSync: db.appConfig.featureIntervalsSync,
        aiEnabled: db.appConfig.aiEnabled,
        aiBaseUrl: db.appConfig.aiBaseUrl,
        aiApiKeyEncrypted: db.appConfig.aiApiKeyEncrypted,
        aiModel: db.appConfig.aiModel,
        aiSystemPrompt: db.appConfig.aiSystemPrompt,
        updatedAt: parseDate(db.appConfig.updatedAt),
      },
    });
  }

  for (const user of db.users ?? []) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        email: user.email,
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
        createdAt: parseDate(user.createdAt),
        updatedAt: parseDate(user.updatedAt ?? user.createdAt),
      },
      create: {
        id: user.id,
        name: user.name,
        email: user.email,
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
        createdAt: parseDate(user.createdAt),
        updatedAt: parseDate(user.updatedAt ?? user.createdAt),
      },
    });
  }

  for (const session of db.sessions ?? []) {
    await prisma.session.upsert({
      where: { id: session.id },
      update: {
        userId: session.userId,
        expiresAt: parseDate(session.expiresAt),
        createdAt: parseDate(session.createdAt),
      },
      create: {
        id: session.id,
        userId: session.userId,
        expiresAt: parseDate(session.expiresAt),
        createdAt: parseDate(session.createdAt),
      },
    });
  }

  for (const ridePlan of db.ridePlans ?? []) {
    await prisma.ridePlan.upsert({
      where: { id: ridePlan.id },
      update: {
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
        createdAt: parseDate(ridePlan.createdAt),
      },
      create: {
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
        createdAt: parseDate(ridePlan.createdAt),
      },
    });
  }

  for (const fuelPlan of db.fuelPlans ?? []) {
    await prisma.fuelPlan.upsert({
      where: { ridePlanId: fuelPlan.ridePlanId },
      update: {
        estimatedDurationMin: fuelPlan.estimatedDurationMin,
        loadLevel: fuelPlan.loadLevel,
        strategyLevel: fuelPlan.strategyLevel,
        carbTargetGPerH: fuelPlan.carbTargetGPerH,
        fluidTargetMlPerH: fuelPlan.fluidTargetMlPerH,
        sodiumTargetMgPerH: fuelPlan.sodiumTargetMgPerH,
        gelCount: fuelPlan.gelCount,
        electrolyteBottleCount: fuelPlan.electrolyteBottleCount,
        summary: fuelPlan.summary,
        carryingListJson: json(fuelPlan.carryingList),
        timelineJson: json(fuelPlan.timeline),
        riskFlagsJson: json(fuelPlan.riskFlags),
        createdAt: parseDate(fuelPlan.createdAt),
      },
      create: {
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
        carryingListJson: json(fuelPlan.carryingList),
        timelineJson: json(fuelPlan.timeline),
        riskFlagsJson: json(fuelPlan.riskFlags),
        createdAt: parseDate(fuelPlan.createdAt),
      },
    });
  }

  for (const activity of db.activities ?? []) {
    await prisma.activity.upsert({
      where: {
        userId_externalActivityId: {
          userId: activity.userId,
          externalActivityId: activity.externalActivityId,
        },
      },
      update: {
        source: activity.source,
        name: activity.name,
        startTime: parseDate(activity.startTime),
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
        rawSummaryJson: json(activity.rawSummaryJson),
        rawStreamsJson: json(activity.rawStreamsJson),
        createdAt: parseDate(activity.createdAt),
        updatedAt: parseDate(activity.updatedAt ?? activity.createdAt),
      },
      create: {
        id: activity.id,
        userId: activity.userId,
        source: activity.source,
        externalActivityId: activity.externalActivityId,
        name: activity.name,
        startTime: parseDate(activity.startTime),
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
        rawSummaryJson: json(activity.rawSummaryJson),
        rawStreamsJson: json(activity.rawStreamsJson),
        createdAt: parseDate(activity.createdAt),
        updatedAt: parseDate(activity.updatedAt ?? activity.createdAt),
      },
    });
  }

  for (const fuelLog of db.fuelLogs ?? []) {
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
        symptomsJson: json(fuelLog.symptoms),
        createdAt: parseDate(fuelLog.createdAt),
        updatedAt: parseDate(fuelLog.updatedAt ?? fuelLog.createdAt),
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
        symptomsJson: json(fuelLog.symptoms),
        createdAt: parseDate(fuelLog.createdAt),
        updatedAt: parseDate(fuelLog.updatedAt ?? fuelLog.createdAt),
      },
    });
  }

  for (const report of db.aiReports ?? []) {
    await prisma.aiReport.upsert({
      where: { activityId: report.activityId },
      update: {
        userId: report.userId,
        reviewText: report.reviewText,
        recoveryText: report.recoveryText,
        fuelReviewText: report.fuelReviewText,
        model: report.model,
        generatedAt: parseDate(report.generatedAt),
      },
      create: {
        id: report.id,
        activityId: report.activityId,
        userId: report.userId,
        reviewText: report.reviewText,
        recoveryText: report.recoveryText,
        fuelReviewText: report.fuelReviewText,
        model: report.model,
        generatedAt: parseDate(report.generatedAt),
      },
    });
  }

  console.log("Legacy JSON migration completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
