export interface RouteSegment {
  startKm: number;
  endKm: number;
  distanceKm: number;
  elevationGainM: number;
  avgGradePct: number;
  maxGradePct: number;
  category: "flat" | "false_flat" | "climb" | "hc" | "descent";
}

export interface RouteProfile {
  totalDistanceKm: number;
  totalElevationM: number;
  segments: RouteSegment[];
}

interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
}

const EARTH_RADIUS_M = 6371000;

function haversineDistance(a: TrackPoint, b: TrackPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function categorizeGrade(avgGrade: number): RouteSegment["category"] {
  if (avgGrade <= -2) return "descent";
  if (avgGrade < 1) return "flat";
  if (avgGrade < 3) return "false_flat";
  if (avgGrade < 8) return "climb";
  return "hc";
}

function extractTrackPoints(gpxText: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;

  let match: RegExpExecArray | null;
  while ((match = trkptRegex.exec(gpxText)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;

    if (!isNaN(lat) && !isNaN(lon)) {
      points.push({ lat, lon, ele: isNaN(ele) ? 0 : ele });
    }
  }

  return points;
}

const WINDOW_M = 500;
const GRADE_THRESHOLD = 2;

export function parseGpx(gpxText: string): RouteProfile {
  const points = extractTrackPoints(gpxText);
  if (points.length < 2) {
    return { totalDistanceKm: 0, totalElevationM: 0, segments: [] };
  }

  // Build cumulative distance + elevation arrays
  const cumDist: number[] = [0];
  let totalElev = 0;

  for (let i = 1; i < points.length; i++) {
    const d = haversineDistance(points[i - 1], points[i]);
    cumDist.push(cumDist[i - 1] + d);
    const gain = points[i].ele - points[i - 1].ele;
    if (gain > 0) totalElev += gain;
  }

  const totalDistM = cumDist[cumDist.length - 1];

  // Compute rolling grade at WINDOW_M intervals
  interface GradePoint {
    distM: number;
    grade: number;
  }

  const gradePoints: GradePoint[] = [];
  let windowStart = 0;

  for (let step = 0; step < totalDistM; step += WINDOW_M) {
    const end = Math.min(step + WINDOW_M, totalDistM);

    // Find point indices for start and end
    while (windowStart < cumDist.length - 1 && cumDist[windowStart + 1] < step) {
      windowStart++;
    }
    let windowEnd = windowStart;
    while (windowEnd < cumDist.length - 1 && cumDist[windowEnd] < end) {
      windowEnd++;
    }

    const hDist = end - step;
    if (hDist < 10) continue;

    // Interpolate elevation at step and end
    const eleAtStep = interpolateEle(points, cumDist, step);
    const eleAtEnd = interpolateEle(points, cumDist, end);
    const grade = ((eleAtEnd - eleAtStep) / hDist) * 100;

    gradePoints.push({ distM: step, grade });
  }

  // Segment by grade changes
  if (gradePoints.length === 0) {
    return { totalDistanceKm: totalDistM / 1000, totalElevationM: Math.round(totalElev), segments: [] };
  }

  const segments: RouteSegment[] = [];
  let segStart = 0;
  let segGrades: number[] = [gradePoints[0].grade];

  for (let i = 1; i < gradePoints.length; i++) {
    const currentAvg = mean(segGrades);
    const newGrade = gradePoints[i].grade;

    if (Math.abs(newGrade - currentAvg) > GRADE_THRESHOLD && segGrades.length >= 1) {
      // Commit segment
      const startKm = gradePoints[segStart].distM / 1000;
      const endKm = gradePoints[i].distM / 1000;
      segments.push(buildSegment(startKm, endKm, segGrades, points, cumDist));

      segStart = i;
      segGrades = [newGrade];
    } else {
      segGrades.push(newGrade);
    }
  }

  // Final segment
  const startKm = gradePoints[segStart].distM / 1000;
  const endKm = totalDistM / 1000;
  if (endKm > startKm) {
    segments.push(buildSegment(startKm, endKm, segGrades, points, cumDist));
  }

  return {
    totalDistanceKm: Math.round((totalDistM / 1000) * 10) / 10,
    totalElevationM: Math.round(totalElev),
    segments,
  };
}

function interpolateEle(points: TrackPoint[], cumDist: number[], targetDist: number): number {
  for (let i = 0; i < cumDist.length - 1; i++) {
    if (cumDist[i] <= targetDist && cumDist[i + 1] >= targetDist) {
      const ratio = (targetDist - cumDist[i]) / (cumDist[i + 1] - cumDist[i] || 1);
      return points[i].ele + (points[i + 1].ele - points[i].ele) * ratio;
    }
  }
  return points[points.length - 1].ele;
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

function buildSegment(
  startKm: number,
  endKm: number,
  grades: number[],
  points: TrackPoint[],
  cumDist: number[],
): RouteSegment {
  const distanceKm = Math.round((endKm - startKm) * 10) / 10;
  const avgGrade = Math.round(mean(grades) * 10) / 10;
  const maxGrade = Math.round(Math.max(...grades) * 10) / 10;

  const startEle = interpolateEle(points, cumDist, startKm * 1000);
  const endEle = interpolateEle(points, cumDist, endKm * 1000);
  const elevationGainM = Math.max(0, Math.round(endEle - startEle));

  return {
    startKm: Math.round(startKm * 10) / 10,
    endKm: Math.round(endKm * 10) / 10,
    distanceKm,
    elevationGainM,
    avgGradePct: avgGrade,
    maxGradePct: maxGrade,
    category: categorizeGrade(avgGrade),
  };
}
