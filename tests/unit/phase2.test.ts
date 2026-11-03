import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_COPY } from "@/domain/copy/errors";
import { BUILD_GOALS } from "@/domain/onboarding";
import { passwordSchema, profileSchema, RESERVED_USERNAMES, usernameSchema } from "@/domain/validation/account";
import { mapError } from "@/features/auth/errors";
import { computeGate, type GateInput } from "@/features/auth/gate";

const done = { username: "sample", onboarding_completed_at: "2026-10-05", onboarding_skipped_at: null };

describe("navigation gate", () => {
  const g = (over: Partial<GateInput>) =>
    computeGate({ status: "signedIn", guest: false, emailVerified: true, profile: done, ...over });

  it("walks welcome -> verify -> username -> onboarding -> app", () => {
    expect(g({ status: "loading" })).toBe("loading");
    expect(g({ status: "signedOut" })).toBe("welcome");
    expect(g({ emailVerified: false })).toBe("verify");
    expect(g({ profile: undefined })).toBe("loading");
    expect(g({ profile: null })).toBe("loading");
    expect(g({ profile: { ...done, username: null } })).toBe("username");
    expect(g({ profile: { ...done, onboarding_completed_at: null } })).toBe("onboarding");
    expect(g({ profile: { ...done, onboarding_completed_at: null, onboarding_skipped_at: "x" } })).toBe("app");
    expect(g({})).toBe("app");
  });

  it("guests and unconnected builds get the app shell; a signed-in user can't skip verification", () => {
    expect(g({ status: "signedOut", guest: true })).toBe("app");
    expect(g({ status: "unconfigured" })).toBe("welcome");
    expect(g({ status: "unconfigured", guest: true })).toBe("app");
    expect(g({ guest: true, emailVerified: false })).toBe("verify");
  });
});

describe("error mapping", () => {
  it("maps Supabase auth codes to the spec copy", () => {
    expect(mapError({ code: "invalid_credentials" }).key).toBe("wrongPassword");
    expect(mapError({ code: "over_request_rate_limit", status: 429 }).key).toBe("tooManyAttempts");
    expect(mapError({ code: "email_not_confirmed" }).key).toBe("checkEmail");
    expect(mapError({ code: "refresh_token_not_found" }).key).toBe("sessionExpired");
    expect(mapError({ code: "otp_expired" }).key).toBe("linkExpired");
    expect(mapError({ name: "AuthRetryableFetchError", message: "Failed to fetch" }).key).toBe("offline");
    expect(mapError(new TypeError("Network request failed")).key).toBe("offline");
    expect(mapError(new Error("not_configured")).key).toBe("notConnected");
  });

  it("maps database errors raised by the migrations", () => {
    expect(mapError({ code: "P0001", message: "rate_limited" }).key).toBe("rateLimited");
    expect(mapError({ code: "P0001", message: "email_not_verified" }).key).toBe("verifyFirst");
    expect(
      mapError({ code: "23505", message: 'duplicate key value violates unique constraint "users_username_key"' }),
    ).toEqual({
      key: "usernameTaken",
      field: "username",
    });
  });

  it("treats a closed Apple/Google sheet as a cancel, and never reveals whether an account exists", () => {
    expect(mapError({ code: "ERR_REQUEST_CANCELED" }).cancelled).toBe(true);
    expect(mapError(new Error("cancelled")).cancelled).toBe(true);
    expect(mapError({ code: "user_already_exists" }).key).toBe("signInFailed");
    expect(mapError({ code: "email_exists" }).key).toBe("signInFailed");
  });

  it("falls back to the server-error copy for anything unknown, with no codes in the text", () => {
    const m = mapError({ code: "XX999", message: "internal: relation users ..." });
    expect(m.key).toBe("server");
    expect(ERROR_COPY[m.key].body).not.toMatch(/XX999|relation/);
  });
});

describe("account validation mirrors the database", () => {
  it("has exactly the reserved usernames the migration has", () => {
    const sql = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../supabase/migrations/20261005000000_phase1_core.sql"),
      "utf8",
    );
    const block = sql.slice(
      sql.indexOf("select name = any (array["),
      sql.indexOf("])", sql.indexOf("select name = any (array[")),
    );
    const fromSql = [...block.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).sort();
    expect([...RESERVED_USERNAMES].sort()).toEqual(fromSql);
  });

  it("usernames: lowercased, 3-20 of a-z0-9_, not reserved", () => {
    expect(usernameSchema.parse("Sample_Rex")).toBe("sample_rex");
    for (const bad of ["ab", "has space", "x".repeat(21), "admin", "dynorex", "émile"]) {
      expect(usernameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("passwords follow the Supabase config policy", () => {
    expect(passwordSchema.safeParse("Abcdefghi1").success).toBe(true);
    for (const bad of ["Short1A", "alllowercase1", "ALLUPPERCASE1", "NoDigitsHere"]) {
      expect(passwordSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("profile fields: trimmed, blank becomes null, limits enforced, control characters refused", () => {
    expect(
      profileSchema.parse({ display_name: "  Sam  ", bio: "", general_location: " ", years_experience: "" }),
    ).toEqual({
      display_name: "Sam",
      bio: null,
      general_location: null,
      years_experience: null,
    });
    expect(
      profileSchema.safeParse({ display_name: null, bio: "x".repeat(281), general_location: null, years_experience: 1 })
        .success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ display_name: "a\u0007b", bio: null, general_location: null, years_experience: null })
        .success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ display_name: null, bio: null, general_location: null, years_experience: "81" })
        .success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ display_name: null, bio: null, general_location: null, years_experience: "-1" })
        .success,
    ).toBe(false);
  });
});

describe("onboarding goals", () => {
  it("has the spec's 8 goals with Just Browsing last, matching the database enum", () => {
    expect(BUILD_GOALS.map((g) => g.id)).toEqual([
      "daily_driver",
      "track_build",
      "show_car",
      "off_road",
      "jdm_build",
      "restomod",
      "stance_build",
      "just_browsing",
    ]);
    const sql = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../supabase/migrations/20261005000000_phase1_core.sql"),
      "utf8",
    );
    for (const g of BUILD_GOALS) expect(sql).toContain(`'${g.id}'`);
  });
});
