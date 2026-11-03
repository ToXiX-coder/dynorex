import { describe, expect, it } from "vitest";
import { ERROR_COPY } from "@/domain/copy/errors";
import {
  buildPath,
  isPublicPath,
  modPath,
  notificationHref,
  regionCell,
  searchTerms,
  shareUrl,
  userPath,
} from "@/domain/deepLinks";
import { categoryLive, NOTIFICATION_CATEGORIES, prefEnabled } from "@/domain/notifications";
import { mapError } from "@/features/auth/errors";
import { addRecent, MAX_RECENT } from "@/features/social/recentSearches";
import { EVENT_SCHEMAS } from "@/services/analytics/events";

const V = "a0000000-0000-4000-8000-000000000001";
const M = "c0000000-0000-4000-8000-000000000001";

describe("deep links", () => {
  it("builds the spec's stable URLs on dynorex.app", () => {
    expect(shareUrl(buildPath(V))).toBe(`https://dynorex.app/build/${V}`);
    expect(modPath(V, M)).toBe(`/build/${V}/mod/${M}`);
    expect(userPath("sample_owner")).toBe("/u/sample_owner");
  });

  it("knows which paths are public (openable without an account)", () => {
    for (const p of [
      "/discover",
      "/discover/botw",
      "/support",
      "/account-deletion",
      `/build/${V}`,
      `/build/${V}/mods`,
      `/build/${V}/mod/${M}`,
      `/v/${V}`,
      "/u/sample_owner",
      `https://dynorex.app/build/${V}?utm=x`,
    ])
      expect(isPublicPath(p), p).toBe(true);
    for (const p of [
      "/",
      "/garage",
      "/settings/subscription",
      "/inbox",
      "/build/not-an-id",
      "/u/a",
      "/discover/../garage",
    ])
      expect(isPublicPath(p), p).toBe(false);
  });

  it("notification taps only route to validated targets", () => {
    expect(notificationHref({ entity_type: "build", entity_id: V, category: "build_update" })).toBe(`/build/${V}`);
    expect(notificationHref({ entity_type: "user", entity_id: "sample_owner" })).toBe("/u/sample_owner");
    expect(notificationHref({ entity_type: "subscription", entity_id: "x" })).toBe("/settings/subscription");
    expect(notificationHref({ entity_type: "botw", entity_id: "x" })).toBe("/discover/botw");
    expect(notificationHref({ entity_type: "listing", entity_id: V })).toBe(`/listings/${V}`);
    expect(notificationHref({ entity_type: "business", entity_id: V })).toBe(`/business/${V}`);
    expect(notificationHref({ entity_type: "service_request", entity_id: V })).toBe(`/requests/${V}`);
    // anything odd falls back to the inbox (null)
    for (const bad of [
      null,
      "build",
      { entity_type: "build", entity_id: "../../settings" },
      { entity_type: "user", entity_id: "https://evil.example" },
      { entity_type: "url", entity_id: "https://evil.example" },
      { entity_type: "event", entity_id: "not-an-id" },
      { entity_type: "listing", entity_id: "../offers" },
    ])
      expect(notificationHref(bad)).toBeNull();
  });
});

describe("nearby grid cell (rounded on the device)", () => {
  it("keeps only a ~55 km cell and matches the database ranges", () => {
    expect(regionCell(40.7128, -74.006)).toEqual({ cell_lat: 81, cell_lon: -149 });
    // two points ~1 km apart land in the same cell: nothing finer is ever sent
    expect(regionCell(40.6, -74.2)).toEqual(regionCell(40.61, -74.21));
    expect(regionCell(90, 180)).toEqual({ cell_lat: 179, cell_lon: 359 });
    expect(regionCell(-90, -180)).toEqual({ cell_lat: -180, cell_lon: -360 });
    expect(regionCell(Number.NaN, 0)).toBeNull();
    expect(regionCell(91, 0)).toBeNull();
  });
});

describe("search terms", () => {
  it("mirror the server: up to 5 lowercase alphanumeric words, starts at 2 characters", () => {
    expect(searchTerms("Subaru WRX")).toEqual({ words: ["subaru", "wrx"], ready: true });
    expect(searchTerms("SB-100")).toEqual({ words: ["sb", "100"], ready: true });
    expect(searchTerms("a").ready).toBe(false);
    expect(searchTerms("!!").ready).toBe(false);
    expect(searchTerms("a b c d e f g").words).toHaveLength(5);
    expect(searchTerms("x' | !(y) & z:*").words).toEqual(["x", "y", "z"]);
  });

  it("recent searches: newest first, no duplicates, capped, local only", () => {
    let list: string[] = [];
    for (const q of ["wrx", "civic", "WRX", "a", ...Array.from({ length: 10 }, (_, i) => `car ${i}`)])
      list = addRecent(list, q);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toBe("car 9");
    expect(list.filter((x) => x.toLowerCase() === "wrx")).toHaveLength(0); // pushed out by newer ones
    expect(addRecent(["WRX"], "wrx")).toEqual(["wrx"]);
  });
});

describe("notification categories", () => {
  it("has a switch for every category in the push table; only Phase 4 ones are sent", () => {
    expect(NOTIFICATION_CATEGORIES.map((c) => c.id)).toEqual([
      "new_follower",
      "build_update",
      "event_reminder",
      "marketplace_offer_received",
      "marketplace_offer_accepted",
      "marketplace_sale_complete",
      "subscription_expiring",
      "subscription_expired",
      "build_of_the_week",
      "service_request_received",
      "service_request_update",
      "post_like",
      "post_comment",
      "club_event",
      "recall",
      "wishlist_match",
      // D-64
      "record_confirm_request",
      "record_confirm_answer",
    ]);
    const live = (marketplace: boolean) =>
      NOTIFICATION_CATEGORIES.filter((c) => categoryLive(c, { marketplace })).map((c) => c.id);
    expect(live(false)).toEqual([
      "new_follower",
      "build_update",
      "event_reminder",
      "subscription_expiring",
      "subscription_expired",
      "recall",
      "record_confirm_answer",
    ]);
    // Shop and Services notifications are sent only while they're on, post and club ones only with Paddock
    expect(live(true)).toHaveLength(14);
    expect(
      NOTIFICATION_CATEGORIES.filter((c) => categoryLive(c, { marketplace: false, paddock: true })).map((c) => c.id),
    ).toEqual([
      "new_follower",
      "build_update",
      "event_reminder",
      "subscription_expiring",
      "subscription_expired",
      "post_like",
      "post_comment",
      "club_event",
      "recall",
      "record_confirm_answer",
    ]);
    expect(prefEnabled([], "new_follower")).toBe(true);
    expect(prefEnabled([{ category: "new_follower", enabled: false }], "new_follower")).toBe(false);
  });
});

describe("errors and analytics for Phase 4", () => {
  it("maps new server errors to the spec voice", () => {
    expect(mapError({ code: "P0001", message: "not_shareable" }).key).toBe("notShareable");
    expect(mapError({ code: "P0001", message: "sign_in_required" }).key).toBe("signInRequired");
    expect(mapError({ code: "P0001", message: "rate_limited" }).key).toBe("rateLimited");
    expect(mapError({ code: "P0002", message: "not_found" }).key).toBe("buildNotFound");
    expect(ERROR_COPY.buildGone.title).toBe("This build no longer exists");
    expect(ERROR_COPY.searchEmpty).toMatchObject({ title: "Nothing found", body: "Try a different search." });
  });

  it("social events carry no identifiers", () => {
    expect(EVENT_SCHEMAS.build_followed.safeParse({}).success).toBe(true);
    expect(EVENT_SCHEMAS.build_followed.safeParse({ build_id: V }).success).toBe(false);
    expect(EVENT_SCHEMAS.build_shared.safeParse({ share_method: "native", url: shareUrl(buildPath(V)) }).success).toBe(
      false,
    );
    expect(EVENT_SCHEMAS.search_performed.safeParse({ result_count: 3, has_results: true, query: "wrx" }).success).toBe(
      false,
    );
    expect(EVENT_SCHEMAS.notification_tapped.safeParse({ notification_type: "build_update" }).success).toBe(true);
  });
});
