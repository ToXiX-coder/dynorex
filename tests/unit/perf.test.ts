import { describe, expect, it } from "vitest";
import { seriesDates } from "@/domain/events";
import {
  analyzeRun,
  crossingMs,
  distances,
  estimateWhp,
  findLaunch,
  modImpact,
  qualityFor,
  QUARTER_M,
  runPhase,
  simulatedRun,
  type Sample,
} from "@/domain/perf";

/** Constant acceleration: v = a t, in mph per second, sampled at `hz`. */
const ramp = (mphPerS: number, seconds: number, hz = 10, restMs = 1000): Sample[] => {
  const out: Sample[] = [];
  for (let t = 0; t <= restMs; t += 1000 / hz) out.push([t, 0]);
  for (let t = 1000 / hz; t <= seconds * 1000; t += 1000 / hz) out.push([restMs + t, (mphPerS * t) / 1000]);
  return out;
};

describe("performance run math (D-60)", () => {
  it("interpolates the moment a speed is crossed", () => {
    expect(
      crossingMs(
        [
          [0, 50],
          [1000, 70],
        ],
        60,
      ),
    ).toBe(500);
    expect(
      crossingMs(
        [
          [0, 10],
          [1000, 20],
        ],
        60,
      ),
    ).toBeNull();
  });

  it("anchors the launch at rest and refuses rolling starts", () => {
    // the car starts moving at 1000 ms; the 1 mph threshold is projected back to 0 mph
    expect(findLaunch(ramp(10, 8))!.ms).toBeCloseTo(1000, 0);
    expect(
      findLaunch([
        [0, 20],
        [1000, 30],
        [2000, 40],
      ]),
    ).toBeNull();
  });

  it("measures 0-60 and the quarter mile on a known pull", () => {
    // 12 mph/s from rest: 60 mph at exactly 5 s
    const r = analyzeRun(ramp(12, 20), null)!;
    expect(r.zeroSixty).toBeCloseTo(5, 1);
    // d = 1/2 a t^2 with a = 12 mph/s = 5.364 m/s^2: quarter at sqrt(2*402.336/5.364) = 12.25 s
    expect(r.quarter).toBeCloseTo(12.25, 1);
    expect(r.trapMph).toBeCloseTo(147, 0);
    expect(r.quality).toBe("good");
    expect(r.samples[0]).toEqual([0, 0]);
  });

  it("grades GPS rate honestly", () => {
    expect(qualityFor(ramp(10, 5, 10)).quality).toBe("good");
    expect(qualityFor(ramp(10, 5, 5)).quality).toBe("fair");
    expect(qualityFor(ramp(10, 5, 1)).quality).toBe("rough");
  });

  it("estimates power only with a weight, in a believable range for the sample pull", () => {
    const run = simulatedRun();
    expect(estimateWhp(run, null)).toBeNull();
    const hp = estimateWhp(run, 3400)!;
    expect(hp).toBeGreaterThan(180);
    expect(hp).toBeLessThan(360);
    const r = analyzeRun(run, 3400)!;
    expect(r.zeroSixty).toBeGreaterThan(4);
    expect(r.zeroSixty).toBeLessThan(6.5);
    expect(r.quarter).toBeGreaterThan(12);
    expect(r.quarter).toBeLessThan(15.5);
  });

  it("knows when a live run is waiting, ready, running and done", () => {
    expect(runPhase([])).toBe("waiting");
    expect(
      runPhase([
        [0, 0],
        [500, 0],
        [1000, 0.2],
      ]),
    ).toBe("ready");
    expect(
      runPhase([
        [0, 0],
        [500, 0],
        [1000, 0.2],
        [1500, 8],
      ]),
    ).toBe("running");
    const lifted: Sample[] = [...ramp(12, 5), [7000, 30]];
    expect(runPhase(lifted)).toBe("done");
    const full = ramp(12, 14);
    expect(distances(full).at(-1)!).toBeGreaterThan(QUARTER_M);
    expect(runPhase(full)).toBe("done");
  });

  it("puts each run in the window of the mod it followed", () => {
    const mods = [
      { id: "m1", name: "Intake", installed_on: "2026-03-01", status: "complete" },
      { id: "m2", name: "Tune", installed_on: "2026-05-01", status: "complete" },
      { id: "m3", name: "Wing", installed_on: null, status: "planned" },
    ];
    const run = (day: string, s: number) => ({
      ran_at: `${day}T10:00:00Z`,
      zero_sixty_s: s,
      quarter_s: null,
      est_whp: null,
    });
    const out = modImpact(mods, [
      run("2026-02-01", 6.1),
      run("2026-02-10", 5.9),
      run("2026-03-05", 5.8),
      run("2026-05-02", 5.3),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "Intake", before: 5.9, after: 5.8, delta: -0.1, runsBefore: 2, runsAfter: 1 });
    expect(out[1]).toMatchObject({ name: "Tune", before: 5.8, after: 5.3, delta: -0.5 });
  });
});

describe("repeating meet dates (D-60)", () => {
  it("keeps the time of day and length, and caps the count at 12", () => {
    const d = seriesDates("2026-11-01T16:00:00.000Z", "2026-11-01T19:00:00.000Z", "weekly", 3);
    expect(d.map((x) => x.starts_at)).toEqual([
      "2026-11-01T16:00:00.000Z",
      "2026-11-08T16:00:00.000Z",
      "2026-11-15T16:00:00.000Z",
    ]);
    expect(d[2]!.ends_at).toBe("2026-11-15T19:00:00.000Z");
    expect(seriesDates("2026-01-31T16:00:00.000Z", "2026-01-31T17:00:00.000Z", "monthly", 2)[1]!.starts_at).toBe(
      "2026-02-28T16:00:00.000Z",
    );
    expect(seriesDates("2026-11-01T16:00:00.000Z", "2026-11-01T17:00:00.000Z", "biweekly", 40)).toHaveLength(12);
  });
});
