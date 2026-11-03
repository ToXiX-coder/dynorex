import { describe, expect, it } from "vitest";
import { garageGreeting, honkLine, odometerBadge, prankPartLine, revAt, searchEggLine } from "@/domain/easterEggs";

describe("honk", () => {
  it("every car honks first; known cars then say their line", () => {
    expect(honkLine("Mazda", "MX-5 Miata", 1999, 0)).toBe("BEEP BEEP!");
    expect(honkLine("Mazda", "MX-5 Miata", 1999, 1)).toMatch(/Miata is always the answer/);
    expect(honkLine("Honda", "Civic Si", 2002, 1)).toMatch(/VTEC/);
    // however the owner typed it
    expect(honkLine("DMC", "DeLorean", 1981, 1)).toMatch(/Great Scott/);
    expect(honkLine("DeLorean", "DMC-12", 1981, 1)).toMatch(/Great Scott/);
    expect(honkLine("Ford", "Escort", 1981, 1)).toBe("Honk honk!");
    expect(honkLine("Subaru", "WRX", 2015, 2)).toMatch(/pssssh/);
  });

  it("the AE86 line needs the right years", () => {
    expect(honkLine("Toyota", "Corolla AE86", 1986, 1)).toMatch(/Tofu/);
    expect(honkLine("Toyota", "Corolla", 2020, 1)).toMatch(/BEEP|Honk|Meep/);
  });

  it("unknown cars cycle generic honks", () => {
    expect([0, 1, 2].map((t) => honkLine("Volvo", "240", 1990, t))).toEqual(["BEEP BEEP!", "Honk honk!", "Meep meep!"]);
  });
});

describe("prank parts", () => {
  it("Torq calls out the classics, any case or spacing", () => {
    expect(prankPartLine("Blinker Fluid")).toMatch(/not a real part/);
    expect(prankPartLine("  muffler   bearing ")).toMatch(/Not a thing/);
    expect(prankPartLine("Flux capacitor")).toMatch(/honest/);
    expect(prankPartLine("Racing stripes")).toMatch(/10 hp/);
  });
  it("real parts get nothing", () => {
    for (const real of ["Cold air intake", "Coilovers", "Big brake kit", "Fluid film undercoating", ""])
      expect(prankPartLine(real), real).toBeNull();
  });
});

describe("search words", () => {
  it("only whole magic words, not normal searches", () => {
    expect(searchEggLine("VTEC")).toMatch(/kicked in/);
    expect(searchEggLine("ka-chow")).toMatch(/Ka-chow/);
    expect(searchEggLine("brap brap")).toMatch(/rotary/);
    expect(searchEggLine("stututu")).toMatch(/Blow-off/);
    expect(searchEggLine("tofu")).toMatch(/hairpins/);
    expect(searchEggLine("civic")).toBeNull();
    expect(searchEggLine("wrx")).toBeNull();
    expect(searchEggLine("vt")).toBeNull();
  });
});

describe("odometer badges", () => {
  it("celebrates real milestones in the owner's own number", () => {
    expect(odometerBadge(100_000, "mi")).toBe("100K club");
    expect(odometerBadge(300_000, "km")).toBe("300K club");
    expect(odometerBadge(123_456, "mi")).toBe("Counting up: 1-2-3-4-5-6");
    expect(odometerBadge(111_111, "mi")).toBe("All 1s on the clock");
    expect(odometerBadge(61_216, "mi")).toBe("Palindrome mi");
    expect(odometerBadge(88_000, "mi")).toMatch(/Great Scott/);
  });
  it("ordinary numbers and missing ones get nothing", () => {
    expect(odometerBadge(61_200, "mi")).toBeNull();
    expect(odometerBadge(null, "mi")).toBeNull();
    expect(odometerBadge(999, "mi")).toBeNull(); // too small to count
  });
});

describe("garage o'clock", () => {
  const at = (day: number, hour: number) => new Date(2026, 9, 4 + day, hour, 30); // Oct 4 2026 is a Sunday
  it("greets at the right times, local", () => {
    expect(garageGreeting(at(6, 8))).toMatch(/Cars & Coffee/); // Saturday 8:30
    expect(garageGreeting(at(0, 9))).toMatch(/Cars & Coffee/); // Sunday 9:30
    expect(garageGreeting(at(3, 2))).toMatch(/Late-night/); // Wednesday 2:30 a.m.
    expect(garageGreeting(at(5, 19))).toMatch(/Friday night/);
    expect(garageGreeting(at(1, 7))).toMatch(/Monday commute/);
    expect(garageGreeting(at(3, 14))).toBeNull(); // Wednesday afternoon: nothing
  });
});

describe("rev limiter", () => {
  it("blips up, bounces near the limiter, settles back to the real reading", () => {
    expect(revAt(0)).toBe(0);
    expect(revAt(220)).toBeGreaterThan(0.9);
    const bounce = [300, 400, 500, 600].map(revAt);
    expect(Math.min(...bounce)).toBeGreaterThan(0.9);
    expect(revAt(1100)).toBe(0);
    expect(revAt(5000)).toBe(0);
  });
});
