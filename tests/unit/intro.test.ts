import { describe, expect, it } from "vitest";
import { INTRO_MS, introFrame, SPEED_SLASHES } from "@/domain/intro";

describe("app-open intro timeline", () => {
  it("lasts 5 seconds", () => {
    expect(INTRO_MS).toBe(5000);
    expect(introFrame(4999).done).toBe(false);
    expect(introFrame(5000).done).toBe(true);
  });

  it("revs from zero into the redline", () => {
    expect(introFrame(0).needle).toBe(0);
    expect(introFrame(350).needle).toBeGreaterThan(0);
    expect(introFrame(350).needle).toBeLessThan(0.8); // still climbing through the revs
    expect(introFrame(700).needle).toBeGreaterThan(0.9); // in the red
  });

  it("bounces off the limiter without leaving the red", () => {
    const bounce = [750, 850, 950, 1050, 1120].map((t) => introFrame(t).needle);
    expect(Math.min(...bounce)).toBeGreaterThan(0.85);
    expect(new Set(bounce.map((v) => v.toFixed(3))).size).toBeGreaterThan(1); // it actually moves
  });

  it("the tachometer fades into the logo", () => {
    expect(introFrame(1000)).toMatchObject({ tachOpacity: 1, logoOpacity: 0 });
    const mid = introFrame(1400);
    expect(mid.tachOpacity).toBeGreaterThan(0);
    expect(mid.tachOpacity).toBeLessThan(1);
    expect(mid.logoOpacity).toBeGreaterThan(0);
    expect(introFrame(2000)).toMatchObject({ tachOpacity: 0, logoOpacity: 1, logoScale: 1 });
  });

  it("the fuel gauge fills slowly from E to F, only ever going up", () => {
    expect(introFrame(1000).fuel).toBe(0); // empty while the tach plays
    const levels = [1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000].map((t) => introFrame(t).fuel);
    for (let i = 1; i < levels.length; i++) expect(levels[i]!).toBeGreaterThanOrEqual(levels[i - 1]!);
    expect(introFrame(3125).fuel).toBeCloseTo(0.5, 1); // half a tank halfway through
    expect(introFrame(INTRO_MS).fuel).toBe(1); // full at the end
  });

  it("speed slashes stay clear of the logo, fuel gauge and tagline in the middle", () => {
    for (const s of SPEED_SLASHES) expect(s.top < 0.3 || s.top > 0.72).toBe(true);
  });
});
