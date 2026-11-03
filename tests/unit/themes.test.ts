import { afterAll, describe, expect, it } from "vitest";
import { color, contrast, DEFAULT_COLORS, themeState } from "@/theme/palette";
import { themed } from "@/theme/themed";
import { ACCENTS, applyTheme, BASES, DEFAULT_CHOICE, parseChoice, resolveBase, rolesFor } from "@/theme/themes";

/** D-59: every theme the person can pick must stay readable. */
describe("themes", () => {
  afterAll(() => applyTheme("asphalt", "lime"));

  it("the default theme is exactly the brand palette roles", () => {
    expect(rolesFor("asphalt", "lime")).toEqual(DEFAULT_COLORS);
  });

  for (const b of BASES) {
    for (const a of ACCENTS) {
      it(`${b.name} + ${a.name} meets contrast`, () => {
        const c = rolesFor(b.id, a.id);
        expect(contrast(c.text, c.background)).toBeGreaterThanOrEqual(7);
        expect(contrast(c.text, c.surface)).toBeGreaterThanOrEqual(7);
        expect(contrast(c.text, c.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.textMuted, c.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.textMuted, c.background)).toBeGreaterThanOrEqual(4.5);
        // accent is used as text (links, selected chips) on both backgrounds
        expect(contrast(c.accent, c.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.accent, c.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
        // boundaries (inputs) and red marks: non-text, 3:1
        expect(contrast(c.border, c.background)).toBeGreaterThanOrEqual(3);
        expect(contrast(c.danger, c.background)).toBeGreaterThanOrEqual(3);
        expect(contrast(c.danger, c.surface)).toBeGreaterThanOrEqual(3);
        // destructive labels are large text (3:1)
        expect(contrast(c.onDanger, c.danger)).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("reads a saved choice defensively", () => {
    expect(parseChoice(null)).toEqual(DEFAULT_CHOICE);
    expect(parseChoice("not json")).toEqual(DEFAULT_CHOICE);
    expect(parseChoice('{"base":"hacker","accent":"ice"}')).toEqual({ base: "asphalt", accent: "ice" });
    expect(parseChoice('{"base":"auto","accent":"???"}')).toEqual({ base: "auto", accent: "lime" });
  });

  it("auto follows the phone", () => {
    expect(resolveBase({ base: "auto", accent: "lime" }, "light")).toBe("daylight");
    expect(resolveBase({ base: "auto", accent: "lime" }, "dark")).toBe("asphalt");
    expect(resolveBase({ base: "auto", accent: "lime" }, null)).toBe("asphalt");
    expect(resolveBase({ base: "carbon", accent: "lime" }, "light")).toBe("carbon");
  });

  it("applyTheme swaps the live roles and themed() style sheets rebuild", () => {
    const styles = themed(() => ({ box: { backgroundColor: color.background } }));
    applyTheme("asphalt", "lime");
    expect(styles.box.backgroundColor).toBe(DEFAULT_COLORS.background);
    applyTheme("daylight", "ice");
    expect(themeState.dark).toBe(false);
    expect(color.accent).toBe(ACCENTS.find((a) => a.id === "ice")!.onLight);
    expect(styles.box.backgroundColor).toBe(BASES.find((b) => b.id === "daylight")!.background);
  });
});
