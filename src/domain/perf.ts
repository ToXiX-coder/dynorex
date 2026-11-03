/**
 * Performance runs (D-60): turn a phone's speed readings into 0-60, quarter-mile and a power estimate.
 * Everything here is an estimate from phone GPS. Labels say so; nothing is called verified or a dyno result.
 * Pure functions, so they're unit-tested and shared by the live screen, the save path and pitch mode.
 */

/** One reading: [ms since the run started, mph]. */
export type Sample = [number, number];

export const MPH_PER_MPS = 2.236936;
export const QUARTER_M = 402.336;
export const ESTIMATE_LABEL = "Phone GPS estimate. Not a timing slip or a dyno result.";
export const SAFETY_NOTE =
  "Closed course or private property only. Never time runs on public roads, and keep your eyes on the road, not the phone.";

export type Quality = "good" | "fair" | "rough";

export interface RunResult {
  zeroSixty: number | null;
  quarter: number | null;
  trapMph: number | null;
  estWhp: number | null;
  sampleHz: number;
  quality: Quality;
  /** the trace from launch onward, rebased so launch is 0 ms */
  samples: Sample[];
}

/** Updates per second, and how far to trust it. Most phones give 1 a second; a 10 Hz GPS add-on gives "good". */
export function qualityFor(samples: readonly Sample[]): { hz: number; quality: Quality } {
  if (samples.length < 2) return { hz: 0.2, quality: "rough" };
  const span = (samples[samples.length - 1]![0] - samples[0]![0]) / 1000;
  const hz = Math.min(50, Math.max(0.2, Math.round(((samples.length - 1) / Math.max(span, 0.001)) * 10) / 10));
  return { hz, quality: hz >= 8 ? "good" : hz >= 4 ? "fair" : "rough" };
}

/** Time (ms) when the trace first rises through `mph`, linearly interpolated; null if it never does. */
export function crossingMs(samples: readonly Sample[], mph: number, from = 0): number | null {
  for (let i = Math.max(1, from); i < samples.length; i++) {
    const [t0, v0] = samples[i - 1]!;
    const [t1, v1] = samples[i]!;
    if (v0 < mph && v1 >= mph) return t0 + ((mph - v0) / (v1 - v0)) * (t1 - t0);
  }
  return null;
}

/**
 * Where the launch is: the last moment the car was below 1 mph before it first passed 5 mph (rest-anchored, no
 * rollout). Returns the sample index to start from and the interpolated launch time.
 */
export function findLaunch(samples: readonly Sample[]): { index: number; ms: number } | null {
  const go = samples.findIndex(([, v]) => v >= 5);
  if (go <= 0) return null;
  let rest = -1;
  for (let i = go - 1; i >= 0; i--)
    if (samples[i]![1] < 1) {
      rest = i;
      break;
    }
  if (rest < 0) return null; // never stopped: a rolling start isn't a 0-60
  // project the rise between 1 and 5 mph back to 0 mph, so the threshold itself doesn't shave time off
  const t1 = crossingMs(samples, 1, rest + 1) ?? samples[rest]![0];
  const t5 = crossingMs(samples, 5, rest + 1) ?? t1;
  const ms = Math.max(samples[rest]![0], t1 - (t5 - t1) / 4);
  return { index: rest, ms };
}

/** Trapezoid distance (m) from the start of `samples` to each sample. */
export function distances(samples: readonly Sample[]): number[] {
  const out = [0];
  for (let i = 1; i < samples.length; i++) {
    const [t0, v0] = samples[i - 1]!;
    const [t1, v1] = samples[i]!;
    out.push(out[i - 1]! + (((v0 + v1) / 2 / MPH_PER_MPS) * (t1 - t0)) / 1000);
  }
  return out;
}

const KG_PER_LB = 0.45359237;
const DRIVER_LB = 180;

/**
 * Wheel power estimate (hp) from how fast speed rose: mass x acceleration x speed, plus air drag and rolling
 * resistance with typical-car constants. The middle of the three highest readings above 15 mph, so one jumpy
 * GPS reading can't set it. Null without a weight or with too few readings.
 */
export function estimateWhp(samples: readonly Sample[], curbWeightLb: number | null): number | null {
  if (!curbWeightLb || samples.length < 4) return null;
  const m = (curbWeightLb + DRIVER_LB) * KG_PER_LB;
  const CdA = 0.75;
  const rho = 1.2;
  const crr = 0.013;
  const powers: number[] = [];
  // acceleration over about a second around each reading, so gear changes and GPS jitter even out
  let lo = 0;
  let hi = 0;
  for (let i = 1; i < samples.length - 1; i++) {
    const ti = samples[i]![0];
    while (lo < i && samples[lo]![0] < ti - 500) lo++;
    while (hi < samples.length - 1 && samples[hi + 1]![0] <= ti + 500) hi++;
    const ia = Math.min(lo, i - 1);
    const ib = Math.max(hi, i + 1);
    const [ta, va] = samples[ia]!;
    const [tb, vb] = samples[ib]!;
    const v = samples[i]![1] / MPH_PER_MPS;
    if (samples[i]![1] < 15 || tb <= ta) continue;
    const a = (vb - va) / MPH_PER_MPS / ((tb - ta) / 1000);
    if (a <= 0) continue;
    powers.push(m * a * v + 0.5 * rho * CdA * v ** 3 + crr * m * 9.81 * v);
  }
  if (powers.length < 3) return null;
  powers.sort((x, y) => y - x);
  const hp = Math.round(powers[1]! / 745.7);
  return hp >= 20 && hp <= 3000 ? hp : null;
}

/** Everything a run shows and saves. Null when there was no standing start to measure from. */
export function analyzeRun(raw: readonly Sample[], curbWeightLb: number | null): RunResult | null {
  const launch = findLaunch(raw);
  if (!launch) return null;
  const samples: Sample[] = raw
    .slice(launch.index)
    .map(([t, v]) => [Math.round(t - launch.ms), Math.round(v * 10) / 10] as Sample);
  // the first reading is at (or just before) rest; pin it to the launch moment
  samples[0] = [0, 0];
  const sixty = crossingMs(samples, 60);
  const dist = distances(samples);
  let quarter: number | null = null;
  let trap: number | null = null;
  for (let i = 1; i < samples.length; i++) {
    if (dist[i - 1]! < QUARTER_M && dist[i]! >= QUARTER_M) {
      const f = (QUARTER_M - dist[i - 1]!) / (dist[i]! - dist[i - 1]!);
      quarter = samples[i - 1]![0] + f * (samples[i]![0] - samples[i - 1]![0]);
      trap = samples[i - 1]![1] + f * (samples[i]![1] - samples[i - 1]![1]);
      break;
    }
  }
  const { hz, quality } = qualityFor(samples);
  const round2 = (ms: number | null) => (ms === null ? null : Math.round(ms / 10) / 100);
  const zeroSixty = round2(sixty);
  const quarterS = round2(quarter);
  if (zeroSixty === null && quarterS === null) return null;
  return {
    zeroSixty: zeroSixty !== null && zeroSixty >= 1.5 && zeroSixty <= 30 ? zeroSixty : null,
    quarter: quarterS !== null && quarterS >= 6 && quarterS <= 40 ? quarterS : null,
    trapMph: quarterS !== null && trap !== null ? Math.round(trap * 10) / 10 : null,
    estWhp: estimateWhp(
      samples.slice(0, quarter ? samples.findIndex(([t]) => t >= quarter!) + 1 : undefined),
      curbWeightLb,
    ),
    sampleHz: hz,
    quality,
    samples: samples.slice(0, 2000),
  };
}

/** Where a live run is: waiting for the car to be still, ready, running, or finished (quarter reached, or lifted). */
export type RunPhase = "waiting" | "ready" | "running" | "done";
export function runPhase(samples: readonly Sample[]): RunPhase {
  if (!samples.length) return "waiting";
  const last = samples[samples.length - 1]!;
  const go = samples.findIndex(([, v]) => v >= 5);
  if (go < 0) {
    // ready once the car has been under 1 mph for a full second
    const still = samples.filter(([t, v]) => v < 1 && last[0] - t <= 1000);
    return still.length >= 2 && last[1] < 1 ? "ready" : "waiting";
  }
  const peak = Math.max(...samples.slice(go).map(([, v]) => v));
  const dist = distances(samples.slice(go));
  if (dist[dist.length - 1]! >= QUARTER_M + 30) return "done";
  if (peak >= 20 && last[1] < peak * 0.6) return "done"; // lifted / braking
  return "running";
}

export interface ModForImpact {
  id: string;
  name: string;
  installed_on: string | null;
  status: string;
}
export interface RunForImpact {
  ran_at: string;
  zero_sixty_s: number | null;
  quarter_s: number | null;
  est_whp: number | null;
}
export interface ModImpact {
  modId: string;
  name: string;
  installedOn: string;
  before: number | null;
  after: number | null;
  /** seconds; negative = quicker */
  delta: number | null;
  runsBefore: number;
  runsAfter: number;
}

/**
 * Before and after each completed mod: the best 0-60 before it went on, and the best after it but before the next
 * mod, so each change gets its own window. Best, not average, because a phone run is noisy.
 */
export function modImpact(mods: readonly ModForImpact[], runs: readonly RunForImpact[]): ModImpact[] {
  const done = mods
    .filter((m) => m.status === "complete" && m.installed_on)
    .sort((a, b) => a.installed_on!.localeCompare(b.installed_on!));
  const timed = runs.filter((r) => r.zero_sixty_s !== null);
  const best = (xs: RunForImpact[]) => (xs.length ? Math.min(...xs.map((r) => Number(r.zero_sixty_s))) : null);
  return done.map((m, i) => {
    const day = m.installed_on!;
    const next = done[i + 1]?.installed_on ?? "9999-12-31";
    const before = timed.filter((r) => r.ran_at.slice(0, 10) < day);
    const after = timed.filter((r) => r.ran_at.slice(0, 10) >= day && r.ran_at.slice(0, 10) < next);
    const b = best(before);
    const a = best(after);
    return {
      modId: m.id,
      name: m.name,
      installedOn: day,
      before: b,
      after: a,
      delta: a !== null && b !== null ? Math.round((a - b) * 100) / 100 : null,
      runsBefore: before.length,
      runsAfter: after.length,
    };
  });
}

/** Pitch mode: a believable 10 Hz pull, standing start with a gear change, ending past the quarter mile. */
export function simulatedRun(hz = 10, vmax = 128, tau = 8.2): Sample[] {
  const out: Sample[] = [];
  const step = 1000 / hz;
  for (let t = 0; t <= 1500; t += step) out.push([Math.round(t), 0]);
  for (let t = step; t <= 17000; t += step) {
    const s = t / 1000;
    let v = vmax * (1 - Math.exp(-s / tau));
    // shifts: a brief flat spot at about 2.7 s and 5.6 s
    if ((s > 2.7 && s < 2.95) || (s > 5.6 && s < 5.85)) v -= 1.2;
    out.push([Math.round(1500 + t), Math.max(0, Math.round(v * 10) / 10)]);
  }
  return out;
}
