import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS, FLAG_KEYS, resolveFlags } from "@/domain/flags";
import { publicMapboxToken } from "@/domain/maps";
import { assertPublicSafe, toPublicVehicle, type VehicleRow } from "@/domain/privacy/publicProjection";
import { containsSensitive, REDACTED, scrub, scrubString } from "@/domain/privacy/scrub";
import { canView, effectiveVisibility } from "@/domain/privacy/visibility";
import { checkImage, MAX_PHOTO_BYTES, safeDisplayName, sniffImage } from "@/domain/validation/upload";
import { ERROR_COPY } from "@/domain/copy/errors";
import { contrast, palette } from "@/theme/palette";

describe("feature flags", () => {
  it("default every v2 capability to off", () => {
    for (const k of FLAG_KEYS) expect(DEFAULT_FLAGS[k]).toBe(false);
  });
  it("accept dev overrides but never in production, and ignore junk", () => {
    expect(resolveFlags("line=true,paddock=yes,nope=true", "development").line).toBe(true);
    expect(resolveFlags("line=true,paddock=yes,nope=true", "development").paddock).toBe(false);
    expect(resolveFlags("line=true", "production").line).toBe(false);
  });
});

describe("scrubbing", () => {
  it("redacts sensitive keys and values at any depth", () => {
    const out = scrub({
      password: "hunter2",
      user: { email: "a@b.co", note: "vin 1HGCM82633A004352 here" },
      headers: { Authorization: "Bearer abc.def" },
      list: ["eyJhbGciOi.eyJzdWIiOi.sig", "fine"],
      pos: "51.507351, -0.127758",
      ok: 42,
    });
    const s = JSON.stringify(out);
    expect(s).not.toContain("hunter2");
    expect(s).not.toContain("a@b.co");
    expect(s).not.toContain("1HGCM82633A004352");
    expect(s).not.toContain("Bearer abc");
    expect(s).not.toContain("eyJhbGciOi");
    expect(s).not.toContain("51.507351");
    expect(s).toContain("fine");
    expect((out as { ok: number }).ok).toBe(42);
  });
  it("handles cycles and never throws", () => {
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    expect(() => scrub(a)).not.toThrow();
  });
  it("detects sensitive content", () => {
    expect(containsSensitive({ make: "Honda" })).toBe(false);
    expect(containsSensitive({ make: "1HGCM82633A004352" })).toBe(true);
    expect(scrubString("sk_live_abc123")).toBe(REDACTED);
  });
});

describe("mapbox token guard", () => {
  it("accepts only public pk. tokens", () => {
    expect(publicMapboxToken(" pk.eyJ1Ijoic2FtcGxlIn0.abc-123_X ")).toBe("pk.eyJ1Ijoic2FtcGxlIn0.abc-123_X");
    expect(publicMapboxToken("sk.eyJ1Ijoic2FtcGxlIn0.abc")).toBeNull();
    expect(publicMapboxToken("tk.eyJ1Ijoic2FtcGxlIn0.abc")).toBeNull();
    expect(publicMapboxToken("")).toBeNull();
    expect(publicMapboxToken(undefined)).toBeNull();
  });
  it("scrubs secret Mapbox tokens from logs", () => {
    expect(scrubString("token sk.eyJ1Ijoic2FtcGxlIn0.abc")).toBe(`token ${REDACTED}`);
  });
});

describe("visibility", () => {
  const base = { viewerId: "v", ownerId: "o", acceptedRelationship: false, blocked: false, isDeleted: false };
  it("owner sees everything that isn't deleted", () => {
    expect(canView("private", { ...base, viewerId: "o" })).toBe(true);
    expect(canView("public", { ...base, viewerId: "o", isDeleted: true })).toBe(false);
  });
  it("friends_only needs an accepted relationship; a follow is not one", () => {
    expect(canView("friends_only", base)).toBe(false);
    expect(canView("friends_only", { ...base, acceptedRelationship: true })).toBe(true);
    expect(canView("friends_only", { ...base, viewerId: null, acceptedRelationship: true })).toBe(false);
  });
  it("blocks beat public", () => {
    expect(canView("public", { ...base, blocked: true })).toBe(false);
    expect(canView("public", { ...base, viewerId: null })).toBe(true);
  });
  it("the most restrictive level wins", () => {
    expect(effectiveVisibility("public", "private")).toBe("private");
    expect(effectiveVisibility("public", "friends_only", "public")).toBe("friends_only");
    expect(effectiveVisibility("public", "public")).toBe("public");
  });
});

describe("public projection (ported from web pilot)", () => {
  const v: VehicleRow = {
    id: "veh-1",
    owner_id: "owner-uuid",
    year: 2004,
    make: "Sample",
    model: "Car",
    trim: null,
    nickname: "Daily",
    vin: "1HGCM82633A004352",
    odometer: 90000,
    description: "private desc",
    hero_path: "owner-uuid/hero.jpg",
    visibility: "public",
    deleted_at: null,
  };
  it("builds from an allow-list and leaves out VIN, owner id, odometer and storage paths", () => {
    const p = toPublicVehicle(v, "sample_user", "signed://x")!;
    const s = JSON.stringify(p);
    expect(s).not.toContain("1HGCM82633A004352");
    expect(s).not.toContain("owner-uuid");
    expect(s).not.toContain("90000");
    expect(s).not.toContain("private desc");
    expect(() => assertPublicSafe(p)).not.toThrow();
  });
  it("returns null for private or deleted vehicles", () => {
    expect(toPublicVehicle({ ...v, visibility: "private" }, "u", null)).toBeNull();
    expect(toPublicVehicle({ ...v, visibility: "friends_only" }, "u", null)).toBeNull();
    expect(toPublicVehicle({ ...v, deleted_at: "2026-01-01" }, "u", null)).toBeNull();
  });
  it("the guard catches a leaked key", () => {
    expect(() => assertPublicSafe({ vin: "x" })).toThrow(/vin/);
  });
});

describe("upload checks (ported from web pilot)", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const heic = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
  it("sniffs real image types from bytes", () => {
    expect(sniffImage(png)).toBe("image/png");
    expect(sniffImage(heic)).toBe("image/heic");
    expect(sniffImage(exe)).toBeNull();
  });
  it("rejects empty, oversized, fake and mismatched files", () => {
    expect(checkImage({ bytes: png, size: 0 })).toEqual({ ok: false, problem: "empty" });
    expect(checkImage({ bytes: png, size: MAX_PHOTO_BYTES + 1 })).toEqual({ ok: false, problem: "too_large" });
    expect(checkImage({ bytes: exe, size: 12, declaredType: "image/png" })).toEqual({
      ok: false,
      problem: "not_an_image",
    });
    expect(checkImage({ bytes: png, size: 12, declaredType: "image/jpeg" })).toEqual({
      ok: false,
      problem: "type_mismatch",
    });
    expect(checkImage({ bytes: png, size: 12, width: 9000, height: 10 })).toEqual({
      ok: false,
      problem: "too_many_pixels",
    });
    expect(checkImage({ bytes: png, size: 12, declaredType: "image/png" })).toEqual({ ok: true, mime: "image/png" });
  });
  it("cleans display names", () => {
    expect(safeDisplayName("../../etc/passwd.png")).toBe("passwd.png");
    expect(safeDisplayName("<script>.jpg")).toBe("_script_.jpg");
  });
});

describe("error copy rules", () => {
  // The spec's verbatim "server" copy breaks the spec's own limits (5-word title, 3-sentence body).
  // Kept verbatim on purpose and listed as an open question in docs/decisions.md (D-07).
  // "This build no longer exists" is the spec's own wording for deleted content (Deep Link URL Schema).
  const KNOWN_SPEC_EXCEPTIONS = new Set(["server", "buildGone"]);
  for (const [key, c] of Object.entries(ERROR_COPY)) {
    it(`${key} follows the voice rules`, () => {
      if (KNOWN_SPEC_EXCEPTIONS.has(key)) return;
      expect(c.title.split(/\s+/).length).toBeLessThanOrEqual(4);
      // "no punctuation" at the end, except the spec's own delete-confirmation questions
      if (!("destructive" in c)) expect(c.title).not.toMatch(/[.!?]$/);
      expect(c.body.split(/(?<=[.!?])\s+/).filter(Boolean).length).toBeLessThanOrEqual(2);
      for (const a of c.actions) expect(a.split(/\s+/).length).toBeLessThanOrEqual(2);
      expect(`${c.title} ${c.body}`).not.toMatch(/an error has occurred|\b[45]\d\d\b|stack/i);
    });
  }
});

describe("palette contrast (rendered pairs used by components)", () => {
  const pairs: [string, string, string, number][] = [
    ["body text on background", palette.boneWhite, palette.asphaltBlack, 4.5],
    ["body text on card", palette.boneWhite, palette.cardSurface, 4.5],
    ["muted text on card", palette.logoGrayLight, palette.cardSurface, 4.5],
    ["muted text on background", palette.logoGrayLight, palette.asphaltBlack, 4.5],
    ["primary button label", palette.asphaltBlack, palette.electricLime, 4.5],
    ["lime text on background", palette.electricLime, palette.asphaltBlack, 4.5],
    // 4.39:1, so destructive labels are rendered as LARGE text (18pt, weight 800) where AA needs 3:1.
    ["destructive button label (large text)", palette.boneWhite, palette.aggressiveRed, 3],
    ["red border vs background (non-text, 3:1)", palette.aggressiveRed, palette.asphaltBlack, 3],
    ["disabled gray text on background (non-essential)", palette.logoGrayDark, palette.asphaltBlack, 4.5],
  ];
  for (const [name, fg, bg, min] of pairs) {
    it(`${name} ≥ ${min}:1`, () => expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min));
  }
  it("red TEXT on asphalt is below 4.5:1, which is why errors use Bone text", () => {
    expect(contrast(palette.aggressiveRed, palette.asphaltBlack)).toBeLessThan(4.5);
  });
});
