import type { RouteProfile, RouteSegment } from "./gpx-parser";

export interface RiderProfile {
  name: string;
  role: "self" | "teammate" | "opponent";
  ftp: number;
  weightKg: number;
  wpKg5min?: number | null;
  wpKg1min?: number | null;
  strength?: string | null;
  weakness?: string | null;
}

export interface SegmentDemand {
  segmentIndex: number;
  category: RouteSegment["category"];
  distanceKm: number;
  avgGradePct: number;
  riders: RiderSegmentDemand[];
}

export interface RiderSegmentDemand {
  name: string;
  role: string;
  requiredWatts: number;
  requiredWpKg: number;
  percentOfFtp: number;
  sustainableMinutes: number;
  vulnerability: number;
}

export interface TacticsAnalysis {
  segmentDemands: SegmentDemand[];
  opponentVulnerabilities: OpponentVulnerability[];
  teamAdvantageZones: AdvantageZone[];
  totalRaceEstimateMin: number;
}

export interface OpponentVulnerability {
  name: string;
  segmentIndex: number;
  percentOfFtp: number;
  reason: string;
}

export interface AdvantageZone {
  segmentIndex: number;
  advantage: string;
  who: string;
}

function estimateRequiredWatts(rider: RiderProfile, segment: RouteSegment): number {
  const grade = segment.avgGradePct / 100;
  const g = 9.81;
  const crr = 0.005;
  const cda = 0.3;
  const rho = 1.2;

  const speedMs = estimateSpeedMs(rider, segment);
  const gravityForce = rider.weightKg * g * grade;
  const rollingForce = rider.weightKg * g * crr;
  const aeroForce = 0.5 * rho * cda * speedMs * speedMs;

  return Math.max(50, Math.round((gravityForce + rollingForce + aeroForce) * speedMs));
}

function estimateSpeedMs(rider: RiderProfile, segment: RouteSegment): number {
  if (segment.category === "hc" || segment.category === "climb") {
    const vpKg = rider.wpKg5min ?? (rider.ftp / rider.weightKg) * 1.05;
    const climbSpeed = (vpKg * rider.weightKg) / (rider.weightKg * 9.81 * (segment.avgGradePct / 100) + 5);
    return Math.max(2, Math.min(climbSpeed, 6));
  }
  if (segment.category === "descent") {
    return 12;
  }
  const ftpWpKg = rider.ftp / rider.weightKg;
  return Math.min(11, 6 + ftpWpKg * 1.2);
}

function estimateSegmentTime(rider: RiderProfile, segment: RouteSegment): number {
  const speedMs = estimateSpeedMs(rider, segment);
  return (segment.distanceKm * 1000) / speedMs / 60;
}

function computeVulnerability(percentOfFtp: number): number {
  if (percentOfFtp <= 85) return 0;
  if (percentOfFtp <= 95) return (percentOfFtp - 85) * 3;
  if (percentOfFtp <= 105) return 30 + (percentOfFtp - 95) * 5;
  return 80 + (percentOfFtp - 105) * 3;
}

export function analyzeTactics(route: RouteProfile, riders: RiderProfile[]): TacticsAnalysis {
  const team = riders.filter((r) => r.role === "self" || r.role === "teammate");
  const opponents = riders.filter((r) => r.role === "opponent");

  const segmentDemands: SegmentDemand[] = route.segments.map((seg, i) => {
    const riderDemands: RiderSegmentDemand[] = riders
      .filter((r) => r.ftp > 0 && r.weightKg > 0)
      .map((rider) => {
        const watts = estimateRequiredWatts(rider, seg);
        const wpKg = watts / rider.weightKg;
        const pctFtp = (watts / rider.ftp) * 100;
        const timeMin = estimateSegmentTime(rider, seg);
        const sustainable = pctFtp <= 100 ? timeMin : Math.max(1, 60 / (pctFtp - 90));

        return {
          name: rider.name,
          role: rider.role,
          requiredWatts: watts,
          requiredWpKg: Math.round(wpKg * 100) / 100,
          percentOfFtp: Math.round(pctFtp),
          sustainableMinutes: Math.round(sustainable),
          vulnerability: computeVulnerability(pctFtp),
        };
      });

    return {
      segmentIndex: i,
      category: seg.category,
      distanceKm: seg.distanceKm,
      avgGradePct: seg.avgGradePct,
      riders: riderDemands,
    };
  });

  const opponentVulnerabilities: OpponentVulnerability[] = [];
  for (const seg of segmentDemands) {
    for (const rd of seg.riders) {
      if (opponents.some((o) => o.name === rd.name) && rd.percentOfFtp > 95) {
        opponentVulnerabilities.push({
          name: rd.name,
          segmentIndex: seg.segmentIndex,
          percentOfFtp: rd.percentOfFtp,
          reason: `需要 ${rd.percentOfFtp}% FTP 维持 ${seg.avgGradePct}% 坡度`,
        });
      }
    }
  }
  opponentVulnerabilities.sort((a, b) => b.percentOfFtp - a.percentOfFtp);

  const teamAdvantageZones: AdvantageZone[] = [];
  for (const seg of segmentDemands) {
    const teamMaxVuln = Math.max(
      ...seg.riders.filter((r) => team.some((t) => t.name === r.name)).map((r) => r.vulnerability),
      0,
    );
    const oppMinVuln = Math.min(
      ...seg.riders.filter((r) => opponents.some((o) => o.name === r.name)).map((r) => r.vulnerability),
      Infinity,
    );

    if (oppMinVuln > teamMaxVuln + 20) {
      const bestTeammate = seg.riders
        .filter((r) => team.some((t) => t.name === r.name))
        .sort((a, b) => a.vulnerability - b.vulnerability)[0];
      teamAdvantageZones.push({
        segmentIndex: seg.segmentIndex,
        advantage: `对手在此段承受 ${Math.round(oppMinVuln)} 压力 vs 队伍 ${Math.round(teamMaxVuln)}`,
        who: bestTeammate?.name ?? team[0]?.name ?? "队伍",
      });
    }
  }

  let totalMin = 0;
  const selfRider = riders.find((r) => r.role === "self");
  if (selfRider) {
    for (const seg of route.segments) {
      totalMin += estimateSegmentTime(selfRider, seg);
    }
  }

  return {
    segmentDemands,
    opponentVulnerabilities: opponentVulnerabilities.slice(0, 10),
    teamAdvantageZones,
    totalRaceEstimateMin: Math.round(totalMin),
  };
}
