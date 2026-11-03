/**
 * Line (routes): pure helpers for the recorder and route pages. The server recomputes distance/duration
 * and trims shared routes itself (public.save_route / trim_route); these are for live display only.
 */
export type TrackPoint = [lat: number, lon: number, epochMs: number];
export type ShapePoint = [lat: number, lon: number];

const R = 6371000;
export function haversineM(a: ShapePoint, b: ShapePoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function trackDistanceM(points: readonly ShapePoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineM(points[i - 1]!, points[i]!);
  return d;
}

/**
 * Should a new GPS fix be kept? Drops inaccurate fixes (> 50 m), jitter while stopped (< 5 m moved) and
 * physically impossible jumps (> 120 m/s, the same rule the server enforces).
 */
export function acceptFix(prev: TrackPoint | undefined, next: TrackPoint, accuracyM: number | null): boolean {
  if (accuracyM !== null && accuracyM > 50) return false;
  if (!prev) return true;
  if (next[2] <= prev[2]) return false;
  const d = haversineM([prev[0], prev[1]], [next[0], next[1]]);
  if (d < 5) return false;
  return d / ((next[2] - prev[2]) / 1000) <= 120;
}

export const formatDistance = (m: number) => `${(m / 1609.344).toFixed(m < 16093 ? 1 : 0)} mi`;
export function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

/**
 * Mirror of the server's trim_route(): drop the first and last `metres`, strip timestamps, round to 5
 * decimals (~1 m). Returns null when nothing would be left (too short to share safely).
 */
export function trimForSharing(points: readonly TrackPoint[], metres = 500): ShapePoint[] | null {
  const n = points.length;
  let d = 0;
  let first = n;
  for (let i = 1; i < n; i++) {
    d += haversineM([points[i - 1]![0], points[i - 1]![1]], [points[i]![0], points[i]![1]]);
    if (d >= metres) {
      first = i;
      break;
    }
  }
  d = 0;
  let last = -1;
  for (let i = n - 2; i >= 0; i--) {
    d += haversineM([points[i + 1]![0], points[i + 1]![1]], [points[i]![0], points[i]![1]]);
    if (d >= metres) {
      last = i;
      break;
    }
  }
  if (first >= last) return null;
  const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
  return points.slice(first, last + 1).map((p) => [r5(p[0]), r5(p[1])]);
}

/** Fit a track into a width x height box (equirectangular, north up) and return an SVG path. */
export function trackToSvgPath(points: readonly ShapePoint[], width: number, height: number, pad = 8): string {
  if (points.length < 2) return "";
  const lat0 = points.reduce((a, p) => a + p[0], 0) / points.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p[1] * kx);
  const ys = points.map((p) => -p[0]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((width - 2 * pad) / (maxX - minX || 1e-9), (height - 2 * pad) / (maxY - minY || 1e-9));
  const ox = (width - (maxX - minX) * scale) / 2;
  const oy = (height - (maxY - minY) * scale) / 2;
  return xs
    .map(
      (x, i) => `${i ? "L" : "M"}${(ox + (x - minX) * scale).toFixed(1)} ${(oy + (ys[i]! - minY) * scale).toFixed(1)}`,
    )
    .join(" ");
}

/** Pitch mode only: a believable synthetic drive (a loop with curves), clearly not anyone's real location. */
export function simulatedDrive(minutes = 18, startMs = Date.now() - minutes * 60_000): TrackPoint[] {
  const pts: TrackPoint[] = [];
  const [lat0, lon0] = [34.05, -118.6]; // a canyon-road-shaped loop in open ocean-side hills
  const n = minutes * 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wiggle = 0.004 * Math.sin(a * 7);
    pts.push([lat0 + 0.03 * Math.sin(a) + wiggle, lon0 + 0.045 * Math.cos(a) - 0.045 + wiggle, startMs + i * 10_000]);
  }
  return pts;
}
