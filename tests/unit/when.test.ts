import { describe, expect, it } from "vitest";
import { whenText } from "@/domain/when";

describe("whenText", () => {
  const now = new Date(2026, 9, 6, 15, 0); // Oct 6 2026, 3 pm local
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("reads like a person would say it", () => {
    expect(whenText(ago(20_000), now)).toBe("just now");
    expect(whenText(ago(12 * 60_000), now)).toBe("12 min ago");
    expect(whenText(ago(3 * 3_600_000), now)).toBe("3 h ago");
    expect(whenText(new Date(2026, 9, 5, 9, 0), now)).toBe("Yesterday");
    expect(whenText(new Date(2026, 9, 2, 9, 0), now)).toBe("4 days ago");
  });

  it("falls back to a short date, with the year only when it differs", () => {
    expect(whenText(new Date(2026, 8, 16), now)).toMatch(/16/);
    expect(whenText(new Date(2026, 8, 16), now)).not.toMatch(/2026/);
    expect(whenText(new Date(2025, 8, 16), now)).toMatch(/2025/);
  });

  it("never shows a future time or garbage", () => {
    expect(whenText(ago(-60_000), now)).toBe("just now");
    expect(whenText("not a date", now)).toBe("");
  });
});
