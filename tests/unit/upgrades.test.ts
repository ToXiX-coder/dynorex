import { describe, expect, it } from "vitest";
import { notificationHref, isPublicPath } from "@/domain/deepLinks";
import { introFrame, QUICK_INTRO_MS, quickIntroFrame } from "@/domain/intro";
import { firstBuildSteps, nextFirstBuildStep } from "@/domain/firstBuild";
import { nextStep, TOUR_STEPS } from "@/domain/tour";

describe("D-61 quick intro", () => {
  it("is 1.2 seconds, never shows the tachometer, and ends full like the long one", () => {
    expect(QUICK_INTRO_MS).toBe(1200);
    for (const t of [0, 300, 900]) expect(quickIntroFrame(t).tachOpacity).toBe(0);
    expect(quickIntroFrame(QUICK_INTRO_MS)).toMatchObject({ fuel: 1, logoOpacity: 1, done: true });
    expect(quickIntroFrame(600).done).toBe(false);
    expect(introFrame(5000).done).toBe(true);
  });
});

describe("D-61 guided tour", () => {
  it("has seven stops that each open a real screen, then ends", () => {
    expect(TOUR_STEPS).toHaveLength(7);
    for (const s of TOUR_STEPS) {
      expect(s.path.startsWith("/")).toBe(true);
      expect(s.title.split(/\s+/).length).toBeLessThanOrEqual(5);
    }
    expect(nextStep(0)).toBe(1);
    expect(nextStep(TOUR_STEPS.length - 1)).toBeNull();
  });
});

describe("D-61 links", () => {
  it("service history links are public; post alerts open the post", () => {
    expect(isPublicPath(`/history/${"a".repeat(64)}`)).toBe(true);
    expect(isPublicPath("/history/short")).toBe(false);
    const post = "d0000000-0000-4000-8000-000000000123";
    expect(notificationHref({ entity_type: "post", entity_id: post })).toBe(`/posts/${post}`);
    expect(notificationHref({ entity_type: "post", entity_id: "../x" })).toBeNull();
  });
});

describe("D-66 start your Build Record", () => {
  it("walks car, finished mod, paperwork, buyer's link, and is done when all four are", () => {
    const none = firstBuildSteps({ vehicleId: null, finishedMods: 0, backed: 0, shared: false });
    expect(none.map((s) => s.id)).toEqual(["car", "mod", "paperwork", "share"]);
    expect(nextFirstBuildStep(none)?.id).toBe("car");
    expect(nextFirstBuildStep(firstBuildSteps({ vehicleId: "v", finishedMods: 1, backed: 0, shared: true }))?.id).toBe(
      "paperwork",
    );
    expect(nextFirstBuildStep(firstBuildSteps({ vehicleId: "v", finishedMods: 1, backed: 1, shared: false }))?.id).toBe(
      "share",
    );
    expect(
      nextFirstBuildStep(firstBuildSteps({ vehicleId: "v", finishedMods: 2, backed: 3, shared: true })),
    ).toBeNull();
  });

  it("never promises more than the record shows", () => {
    const copy = firstBuildSteps({ vehicleId: null, finishedMods: 0, backed: 0, shared: false })
      .map((s) => `${s.title} ${s.detail}`)
      .join(" ");
    expect(copy).not.toMatch(/verified|certified|guarantee/i);
  });
});
