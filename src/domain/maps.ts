/**
 * Maps provider: Mapbox (owner decision 2026-10-04, replacing Waze). Used by Line (v2, flag off).
 * The app may only ever hold a PUBLIC Mapbox token ("pk."). Secret ("sk.") and temporary ("tk.")
 * tokens are refused so a misconfigured build can't ship one.
 */
export const MAP_PROVIDER = "mapbox" as const;

export function publicMapboxToken(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  return /^pk\.[\w-]+\.[\w-]+$/.test(t) ? t : null;
}

/** Google/Mapbox encoded polyline, precision 5. Points are [lat, lon]. */
export function encodePolyline(points: readonly (readonly [number, number])[]): string {
  let out = "";
  let pLat = 0;
  let pLon = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lon] of points) {
    const a = Math.round(lat * 1e5);
    const b = Math.round(lon * 1e5);
    out += enc(a - pLat) + enc(b - pLon);
    pLat = a;
    pLon = b;
  }
  return out;
}

/**
 * Fewer points with the same shape (Ramer-Douglas-Peucker on a flat projection), so a long drive fits in one
 * map URL. The tolerance grows until the result has at most `max` points; first and last are always kept.
 */
export function simplifyTrack(points: readonly (readonly [number, number])[], max = 300): [number, number][] {
  const pts = points.map(([a, b]) => [a, b] as [number, number]);
  if (pts.length <= max) return pts;
  const dist = (p: [number, number], a: [number, number], b: [number, number]) => {
    const k = Math.cos((a[0] * Math.PI) / 180);
    const [px, py, ax, ay, bx, by] = [p[1] * k, p[0], a[1] * k, a[0], b[1] * k, b[0]];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const rdp = (eps: number) => {
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack: [number, number][] = [[0, pts.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop()!;
      let best = -1;
      let bestD = eps;
      for (let k = i + 1; k < j; k++) {
        const d = dist(pts[k]!, pts[i]!, pts[j]!);
        if (d > bestD) {
          bestD = d;
          best = k;
        }
      }
      if (best > 0) {
        keep[best] = 1;
        stack.push([i, best], [best, j]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  };
  for (let eps = 1e-5; eps < 1; eps *= 2) {
    const r = rdp(eps);
    if (r.length <= max) return r;
  }
  return [pts[0]!, pts[pts.length - 1]!];
}

export const STATIC_MAP_MAX_URL = 8192;

/**
 * A Mapbox Static Images URL with numbered pins (events map). Only public meeting places go in: each one is a
 * spot the host picked and published. Pins are numbered 1-9 in the order given; null without a public token.
 */
export function staticPinsMapUrl(
  pins: readonly { lat: number; lng: number }[],
  token: string | null,
  opts: { width?: number; height?: number; style?: string } = {},
): string | null {
  const pk = publicMapboxToken(token ?? undefined);
  const list = pins.filter((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180).slice(0, 9);
  if (!pk || !list.length) return null;
  const width = Math.min(1280, Math.max(1, Math.round(opts.width ?? 600)));
  const height = Math.min(1280, Math.max(1, Math.round(opts.height ?? 320)));
  const style = opts.style ?? "mapbox/dark-v11";
  const overlay = list.map((p, i) => `pin-l-${i + 1}+aaff00(${p.lng.toFixed(5)},${p.lat.toFixed(5)})`).join(",");
  // one pin: zoom to the neighbourhood; several: fit them all
  const view = list.length === 1 ? `${list[0]!.lng.toFixed(5)},${list[0]!.lat.toFixed(5)},14` : "auto";
  return (
    `https://api.mapbox.com/styles/v1/${style}/static/${overlay}/${view}/${width}x${height}@2x` +
    `?padding=40&attribution=true&logo=true&access_token=${pk}`
  );
}

/**
 * A Mapbox Static Images URL for a SHARED (already trimmed by the server) route. Only ever call this with
 * public points: the request goes to Mapbox, so a private track (with its real start and finish) must never be
 * sent. Returns null without a public token or when the URL would be too long; callers fall back to the trace.
 */
export function staticRouteMapUrl(
  shared: readonly (readonly [number, number])[],
  token: string | null,
  opts: { width?: number; height?: number; color?: string; style?: string } = {},
): string | null {
  const pk = publicMapboxToken(token ?? undefined);
  if (!pk || shared.length < 2) return null;
  const width = Math.min(1280, Math.max(1, Math.round(opts.width ?? 600)));
  const height = Math.min(1280, Math.max(1, Math.round(opts.height ?? 300)));
  const hex = (opts.color ?? "aaff00").replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  const style = opts.style ?? "mapbox/dark-v11";
  for (const max of [300, 150, 60]) {
    const line = encodeURIComponent(encodePolyline(simplifyTrack(shared, max)));
    const url =
      `https://api.mapbox.com/styles/v1/${style}/static/path-4+${hex}-1(${line})/auto/${width}x${height}@2x` +
      `?padding=24&attribution=true&logo=true&access_token=${pk}`;
    if (url.length <= STATIC_MAP_MAX_URL) return url;
  }
  return null;
}
