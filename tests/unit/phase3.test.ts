import { describe, expect, it } from "vitest";
import { checkProductLink } from "@/domain/links";
import { formatMoney, parseMoney, summariseCosts } from "@/domain/money";
import { estimateSpecs, formatSpec, roundHalfAway, SPEC_DISCLAIMER, type ModForSpecs } from "@/domain/specs";
import { buildSpecDeltas, modFormSchema, vehicleFormSchema } from "@/domain/validation/build";
import { acceptImage, inspectImage } from "../../supabase/functions/_shared/image";

const base = { baseline_hp: 200, baseline_torque_lbft: 180, baseline_weight_lb: 2800, baseline_zero_to_sixty_s: 6.9 };
const mod = (status: ModForSpecs["status"], d: ModForSpecs["spec_deltas"]): ModForSpecs => ({ status, spec_deltas: d });

describe("spec estimates", () => {
  it("adds only COMPLETE mods; planned and in-progress are reported separately", () => {
    const e = estimateSpecs(base, [
      mod("complete", { schema_version: 1, hp: { delta: 15, unit: "hp" }, weight: { delta: -20, unit: "lb" } }),
      mod("planned", { schema_version: 1, hp: { delta: 90, unit: "hp" } }),
      mod("in_progress", {
        schema_version: 1,
        hp: { delta: 10, unit: "hp" },
        zero_to_sixty: { delta: -0.3, unit: "s" },
      }),
    ]);
    expect(e.hp).toBe(215);
    expect(e.weight_lb).toBe(2780);
    expect(e.zero_to_sixty_s).toBe(6.9);
    expect(e.completed_mods_counted).toBe(1);
    expect(e.pending_hp_delta).toBe(100);
    expect(e.pending_zero_to_sixty_delta).toBe(-0.3);
    expect(e.lb_per_hp).toBe(12.9);
  });

  it("converts kW, Nm and kg", () => {
    const e = estimateSpecs(base, [
      mod("complete", {
        schema_version: 1,
        hp: { delta: 10, unit: "kw" },
        torque: { delta: 20, unit: "nm" },
        weight: { delta: -10, unit: "kg" },
      }),
    ]);
    expect(e.hp).toBe(213); // 200 + 13.41
    expect(e.torque_lbft).toBe(195); // 180 + 14.75
    expect(e.weight_lb).toBe(2778); // 2800 - 22.05
  });

  it("says unknown when the baseline is missing, never zero", () => {
    const e = estimateSpecs({ ...base, baseline_hp: null }, [
      mod("complete", { schema_version: 1, hp: { delta: 50, unit: "hp" } }),
    ]);
    expect(e.hp).toBeNull();
    expect(e.hp_status).toBe("unknown");
    expect(e.lb_per_hp_status).toBe("unknown");
    expect(formatSpec(e.hp, e.hp_status)).toBe("—");
  });

  it("flags impossible results instead of showing them", () => {
    const e = estimateSpecs(base, [mod("complete", { schema_version: 1, zero_to_sixty: { delta: -10, unit: "s" } })]);
    expect(e.zero_to_sixty_status).toBe("invalid");
    expect(e.zero_to_sixty_s).toBeNull();
    expect(formatSpec(e.zero_to_sixty_s, e.zero_to_sixty_status, 1)).toBe("Check");
  });

  it("ignores deleted mods and rounds half away from zero", () => {
    expect(
      estimateSpecs(base, [
        { ...mod("complete", { schema_version: 1, hp: { delta: 50, unit: "hp" } }), deleted_at: "x" },
      ]).hp,
    ).toBe(200);
    expect(roundHalfAway(2.5)).toBe(3);
    expect(roundHalfAway(-2.5)).toBe(-3);
    expect(roundHalfAway(1.05, 1)).toBe(1.1);
  });

  it("uses the exact disclaimer text", () => {
    expect(SPEC_DISCLAIMER).toBe("Estimates based on user-reported data. Dynorex is not responsible for accuracy.");
  });
});

describe("money", () => {
  it("parses into integer minor units and refuses junk", () => {
    expect(parseMoney("1,249.5", "USD")).toBe(124950);
    expect(parseMoney("0", "USD")).toBe(0);
    expect(parseMoney("", "USD")).toBeNull();
    expect(parseMoney("12.345", "USD")).toBeNaN();
    expect(parseMoney("-5", "USD")).toBeNaN();
    expect(parseMoney("3000", "JPY")).toBe(3000);
    expect(parseMoney("30.5", "JPY")).toBeNaN();
  });

  it("never mixes currencies and computes category shares", () => {
    const s = summariseCosts([
      { currency: "USD", category: "engine", spent_minor: 30000, planned_minor: 100000 },
      { currency: "USD", category: "suspension", spent_minor: 10000, planned_minor: 0 },
      { currency: "CAD", category: "wheels", spent_minor: 50000, planned_minor: 0 },
    ]);
    const usd = s.find((x) => x.currency === "USD")!;
    expect(usd.spent).toBe(40000);
    expect(usd.planned).toBe(100000);
    expect(usd.categories.map((c) => [c.category, c.share])).toEqual([
      ["engine", 0.75],
      ["suspension", 0.25],
    ]);
    expect(s.find((x) => x.currency === "CAD")!.spent).toBe(50000);
    expect(formatMoney(124950, "USD")).toMatch(/1,?249\.50/);
  });
});

describe("wishlist links", () => {
  it("accepts plain https links to public sites", () => {
    const r = checkProductLink(" https://shop.example.com/part/123?ref=x ");
    expect(r).toMatchObject({ ok: true, host: "shop.example.com" });
  });
  it("rejects unsafe schemes, credentials, private hosts and junk", () => {
    for (const bad of [
      "javascript:alert(1)",
      "http://shop.example.com",
      "data:text/html,hi",
      "intent://x",
      "https://user:pw@shop.example.com",
      "https://evil.com@shop.example.com",
      "https://localhost/x",
      "https://192.168.1.10/x",
      "https://10.0.0.1",
      "https://intranet/x",
      "https://shop.example.com/a b",
      "",
    ]) {
      expect(checkProductLink(bad).ok, bad).toBe(false);
    }
  });
});

describe("vehicle and mod forms", () => {
  const v = {
    year: "2004",
    make: "Sample",
    model: "Coupe",
    trim_level: "",
    nickname: "",
    vin: "",
    odometer: "",
    odometer_unit: "mi",
    description: "",
    baseline_hp: "",
    baseline_torque_lbft: "",
    baseline_weight_lb: "",
    baseline_zero_to_sixty_s: "",
    visibility: "private",
  };
  it("vehicle: required fields, optional blanks become null, VIN uppercased and checked", () => {
    const ok = vehicleFormSchema.parse({ ...v, vin: "1hgcm82633a004352", baseline_hp: "200" });
    expect(ok.vin).toBe("1HGCM82633A004352");
    expect(ok.baseline_hp).toBe(200);
    expect(ok.nickname).toBeNull();
    for (const bad of [
      { year: "1700" },
      { make: "" },
      { vin: "IOQ12345678901234" },
      { odometer: "1.5" },
      { baseline_weight_lb: "50" },
      { baseline_zero_to_sixty_s: "0" },
    ]) {
      expect(vehicleFormSchema.safeParse({ ...v, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("mod: cost becomes minor units, blank cost drops the currency, bad cost keeps a field error", () => {
    const m = {
      name: "Coilovers",
      category: "suspension",
      brand: "",
      part_number: "",
      cost: "1,250.00",
      currency: "USD",
      status: "complete",
      notes: "",
      installed_on: "",
    };
    expect(modFormSchema.parse(m)).toMatchObject({
      cost_minor: 125000,
      currency: "USD",
      brand: null,
      installed_on: null,
    });
    expect(modFormSchema.parse({ ...m, cost: "" })).toMatchObject({ cost_minor: null, currency: null });
    const bad = modFormSchema.safeParse({ ...m, cost: "12.999" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(["cost"]);
    expect(modFormSchema.safeParse({ ...m, category: "teleporter" }).success).toBe(false);
    expect(modFormSchema.safeParse({ ...m, installed_on: "2026-02-30x" }).success).toBe(false);
  });

  it("spec deltas: only filled fields, units checked, limits applied", () => {
    expect(buildSpecDeltas({ hp: { delta: "15", unit: "hp" }, torque: { delta: "", unit: "lb-ft" } })).toEqual({
      ok: true,
      value: { schema_version: 1, hp: { delta: 15, unit: "hp" } },
    });
    expect(buildSpecDeltas({ hp: { delta: "abc", unit: "hp" } }).ok).toBe(false);
    expect(buildSpecDeltas({ hp: { delta: "5000", unit: "hp" } }).ok).toBe(false);
    expect(buildSpecDeltas({ weight: { delta: "-10", unit: "stone" } }).ok).toBe(false);
    expect(buildSpecDeltas({ zero_to_sixty: { delta: "-0,3", unit: "s" } })).toEqual({
      ok: true,
      value: { schema_version: 1, zero_to_sixty: { delta: -0.3, unit: "s" } },
    });
  });
});

describe("image acceptance (shared with the register-photo Edge Function)", () => {
  // minimal JPEG: SOI, APP0 JFIF, SOF0 (h=480,w=640), EOI
  const jpegNoExif = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11,
    0x01, 0xff, 0xd9,
  ]);
  const exif = [0xff, 0xe1, 0x00, 0x10, ...[..."Exif\0\0"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, 0, 0, 0, 0];
  const jpegWithExif = new Uint8Array([...jpegNoExif.slice(0, 2), ...exif, ...jpegNoExif.slice(2)]);
  const pngHeader = (extra: number[] = []) =>
    new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      0,
      0,
      0,
      13,
      ..."IHDR".split("").map((c) => c.charCodeAt(0)),
      0,
      0,
      0x03,
      0x20,
      0,
      0,
      0x02,
      0x58,
      8,
      2,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ...extra,
      0,
      0,
      0,
      0,
      ..."IEND".split("").map((c) => c.charCodeAt(0)),
      0,
      0,
      0,
      0,
    ]);
  const pngText = [0, 0, 0, 4, ..."tEXt".split("").map((c) => c.charCodeAt(0)), 0x61, 0, 0x62, 0x63, 0, 0, 0, 0];

  it("reads type and dimensions from the bytes", () => {
    expect(inspectImage(jpegNoExif)).toEqual({ mime: "image/jpeg", width: 640, height: 480, hasMetadata: false });
    expect(inspectImage(pngHeader())).toEqual({ mime: "image/png", width: 800, height: 600, hasMetadata: false });
  });

  it("accepts a clean image and refuses metadata, wrong extension, junk and oversize", () => {
    expect(acceptImage(jpegNoExif, "jpg").ok).toBe(true);
    expect(acceptImage(jpegWithExif, "jpg")).toEqual({ ok: false, problem: "has_metadata" });
    expect(acceptImage(pngHeader(pngText), "png")).toEqual({ ok: false, problem: "has_metadata" });
    expect(acceptImage(jpegNoExif, "png")).toEqual({ ok: false, problem: "type_mismatch" });
    expect(acceptImage(new Uint8Array([0x4d, 0x5a, 0, 0]), "jpg")).toEqual({ ok: false, problem: "not_an_image" });
    expect(acceptImage(new Uint8Array(0), "jpg")).toEqual({ ok: false, problem: "empty" });
    expect(acceptImage(new Uint8Array(10 * 1024 * 1024 + 1), "jpg")).toEqual({ ok: false, problem: "too_large" });
  });
});
