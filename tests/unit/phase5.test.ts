import { beforeEach, describe, expect, it, vi } from "vitest";
import { stickerSvg } from "@/components/mascot/stickers";
import { DEMO_ME } from "@/demo/data";
import {
  demoActivatePlus,
  demoBuildService,
  demoProfileService,
  demoSocialService,
  demoSubscriptionService,
  resetDemo,
} from "@/demo/services";
import { ERROR_COPY } from "@/domain/copy/errors";
import {
  describeSubscription,
  LIST_PRICES,
  MANAGE_URLS,
  PLAN_COMPARISON,
  planRowLive,
  renewalDisclosure,
  STICKERS,
} from "@/domain/plus";
import { mapError } from "@/features/auth/errors";

// config.ts reads expo-constants; only the pure helper is under test here
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { appEnv: "development" }, version: "0.1.0" } } }));
const { resolveDemoMode } = await import("@/services/config");

describe("pitch mode switch", () => {
  it("is only on when asked for, and never in production builds", () => {
    expect(resolveDemoMode("true", "development")).toBe(true);
    expect(resolveDemoMode("true", "staging")).toBe(true);
    expect(resolveDemoMode("true", "production")).toBe(false);
    expect(resolveDemoMode(undefined, "development")).toBe(false);
    expect(resolveDemoMode("1", "development")).toBe(false);
  });
});

describe("Dynorex+ display rules", () => {
  it("uses the spec's prices and a full renewal + cancellation disclosure", () => {
    expect(LIST_PRICES.monthly.price).toBe("$7.99");
    expect(LIST_PRICES.annual.price).toBe("$59.99");
    const t = renewalDisclosure("annual", "$59.99", "app_store");
    expect(t).toMatch(/\$59\.99 per year/);
    expect(t).toMatch(/Renews automatically/);
    expect(t).toMatch(/Cancel any time in your Apple ID settings at least 24 hours before renewal/);
    expect(renewalDisclosure("monthly", "7,99 €", "play_store")).toMatch(/7,99 € per month.*Google Play/);
    expect(MANAGE_URLS.play_store).toMatch(/^https:\/\/play\.google\.com\//);
  });

  it("marks not-yet-built capabilities instead of selling them", () => {
    const later = (flags: { line: boolean; paddock: boolean; marketplace: boolean }) =>
      PLAN_COMPARISON.filter((r) => !planRowLive(r.available, flags)).map((r) => r.feature);
    // production: Line, Paddock and the marketplace are off, so they are shown as "later", never sold
    expect(later({ line: false, paddock: false, marketplace: false })).toEqual([
      "Route recordings",
      "Stickers in Paddock comments",
      "Shop listings",
      "Early access",
    ]);
    // pitch mode turns Line, Paddock and the Shop on
    expect(later({ line: true, paddock: true, marketplace: false })).toEqual(["Shop listings", "Early access"]);
    expect(later({ line: true, paddock: true, marketplace: true })).toEqual(["Early access"]);
  });

  it("describes every server status in plain words", () => {
    const base = {
      product_id: "dynorex_plus_monthly",
      grace_until: null,
      via_override: false,
      expires_at: "2026-11-05T00:00:00Z",
    };
    expect(describeSubscription({ ...base, plus: false, status: null })).toBe("You're on the Free plan.");
    expect(describeSubscription({ ...base, plus: true, status: "active" })).toMatch(/^Dynorex\+ monthly\. Renews on/);
    expect(describeSubscription({ ...base, plus: true, status: "cancelled" })).toMatch(/You keep it until/);
    expect(describeSubscription({ ...base, plus: true, status: "grace", grace_until: base.expires_at })).toMatch(
      /Payment problem/,
    );
    expect(describeSubscription({ ...base, plus: false, status: "billing_retry" })).toMatch(/paused/);
    expect(describeSubscription({ ...base, plus: false, status: "refunded" })).toMatch(/refunded/);
    expect(describeSubscription({ ...base, plus: true, status: null, via_override: true })).toMatch(/staff or tester/);
  });

  it("has the spec's 12 stickers, each drawable", () => {
    expect(STICKERS).toHaveLength(12);
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(12);
    for (const s of STICKERS) {
      const svg = stickerSvg(s.id);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.match(/<svg/g)).toHaveLength(1);
    }
  });

  it("maps a Plus-only refusal to the paywall copy", () => {
    expect(mapError({ code: "P0001", message: "plus_required" }).key).toBe("paywall");
    expect(ERROR_COPY.planLimitVehicles.actions).toEqual(["See Dynorex+"]);
  });
});

describe("pitch-mode sample backend follows the server's rules", () => {
  beforeEach(() => resetDemo());

  it("free limits apply until the (simulated) purchase, then lift", async () => {
    const form = { year: 2001, make: "Sample", model: "Car", visibility: "private" } as never;
    const r = await demoBuildService.createVehicle(form, "ref-1");
    expect(r).toEqual({ ok: false, error: { key: "planLimitVehicles" } }); // sample garage already has 2
    expect((await demoSubscriptionService.advancedSpecs("x")).ok).toBe(false);
    demoActivatePlus("annual", "app_store");
    expect((await demoSubscriptionService.mySubscription()).ok && true).toBe(true);
    const ok = await demoBuildService.createVehicle(form, "ref-1");
    expect(ok.ok).toBe(true);
    // the same client_ref doesn't create a second one
    const again = await demoBuildService.createVehicle(form, "ref-1");
    expect(again.ok && ok.ok && again.data === ok.data).toBe(true);
  });

  it("private builds vanish from public pages, Discover and search; never the VIN or costs", async () => {
    const garage = await demoBuildService.listVehicles(0);
    const wrx = garage.ok ? garage.data.find((v) => v.make === "Subaru")! : null;
    const page = await demoSocialService.publicBuild(wrx!.id);
    expect(page.ok && page.data.status).toBe("public");
    expect(JSON.stringify(page)).not.toMatch(/cost_minor|odometer|"vin"|notes/);
    await demoSocialService.setBuildPublic(wrx!.id, false);
    const hidden = await demoSocialService.publicBuild(wrx!.id);
    expect(hidden.ok && hidden.data.status).toBe("not_found");
    const found = await demoSocialService.search("weekend");
    expect(found.ok && found.data).toEqual([]);
  });

  it("stickers need Dynorex+; blocking hides the other person everywhere", async () => {
    const d = await demoSocialService.discover("trending", 0);
    const evo = d.ok ? d.data.find((b) => b.owner_username === "apex_hunter")! : null;
    expect(await demoSubscriptionService.react(evo!.build_id, "fire")).toEqual({
      ok: false,
      error: { key: "paywall" },
    });
    demoActivatePlus("monthly", "play_store");
    expect((await demoSubscriptionService.react(evo!.build_id, "fire")).ok).toBe(true);
    const prof = await demoProfileService.getPublic("apex_hunter");
    await demoProfileService.block(prof.ok ? prof.data!.user_id : "");
    const after = await demoSocialService.discover("trending", 0);
    expect(after.ok && after.data.some((b) => b.owner_username === "apex_hunter")).toBe(false);
    const gone = await demoProfileService.getPublic("apex_hunter");
    expect(gone.ok && gone.data).toBeNull();
  });

  it("sample data is clearly not a real account", async () => {
    const me = await demoProfileService.getMine();
    expect(me.ok && me.data?.id).toBe(DEMO_ME);
    expect(me.ok && me.data?.username).toBe("demo_driver");
  });
});
