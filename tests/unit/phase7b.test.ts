import { describe, expect, it } from "vitest";
import { create } from "qrcode/lib/core/qrcode";
import { ERROR_COPY } from "@/domain/copy/errors";
import { isPublicPath } from "@/domain/deepLinks";
import { checkinQrPayload, parseCheckinQr } from "@/domain/events";
import { encodePolyline, simplifyTrack, STATIC_MAP_MAX_URL, staticRouteMapUrl } from "@/domain/maps";
import { mapError } from "@/features/auth/errors";

const E = "d0000000-0000-4000-8000-000000000705";
const OTHER = "d0000000-0000-4000-8000-000000000701";
const PK = "pk.eyJ1Ijoic2FtcGxlIn0.abc-123_X";

describe("QR check-in payload", () => {
  it("round-trips the code for this event only", () => {
    const p = checkinQrPayload(E, "042917");
    expect(p).toBe(`https://dynorex.app/events/${E}?checkin=042917`);
    expect(parseCheckinQr(p, E)).toBe("042917");
    // the public link opens the event page (a phone's own camera works too)
    expect(isPublicPath(p)).toBe(true);
  });

  it("rejects other events, other sites and malformed codes", () => {
    for (const bad of [
      checkinQrPayload(OTHER, "042917"),
      `https://evil.example/events/${E}?checkin=042917`,
      `https://dynorex.app/events/${E}?checkin=42917`,
      `https://dynorex.app/events/${E}?checkin=0429170`,
      `https://dynorex.app/events/${E}?checkin=042917&next=https://evil.example`,
      "042917",
      "x".repeat(500),
    ])
      expect(parseCheckinQr(bad, E), bad.slice(0, 60)).toBeNull();
  });

  it("encodes to a scannable QR matrix", () => {
    const m = create(checkinQrPayload(E, "000001"), { errorCorrectionLevel: "M" }).modules;
    expect(m.size).toBeGreaterThanOrEqual(21);
    // finder pattern corner is dark
    expect(m.get(0, 0)).toBeTruthy();
  });
});

describe("Mapbox static route maps", () => {
  it("encodes polylines the standard way (Google's reference example)", () => {
    expect(
      encodePolyline([
        [38.5, -120.2],
        [40.7, -120.95],
        [43.252, -126.453],
      ]),
    ).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  it("simplifies long tracks but keeps both ends", () => {
    const long = Array.from(
      { length: 5000 },
      (_, i) => [34 + i * 1e-4, -118 + Math.sin(i / 50) * 0.01] as [number, number],
    );
    const s = simplifyTrack(long, 300);
    expect(s.length).toBeLessThanOrEqual(300);
    expect(s[0]).toEqual(long[0]);
    expect(s[s.length - 1]).toEqual(long[long.length - 1]);
    const short: [number, number][] = [
      [1, 2],
      [3, 4],
    ];
    expect(simplifyTrack(short)).toEqual(short);
  });

  it("only builds a URL with a public pk. token, within the URL limit", () => {
    const pts = Array.from(
      { length: 4000 },
      (_, i) => [34 + i * 1e-4, -118 + Math.cos(i / 9) * 0.02] as [number, number],
    );
    const url = staticRouteMapUrl(pts, PK)!;
    expect(url.startsWith("https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/path-4+aaff00-1(")).toBe(true);
    expect(url.length).toBeLessThanOrEqual(STATIC_MAP_MAX_URL);
    expect(url).toContain(`access_token=${PK}`);
    expect(staticRouteMapUrl(pts, "sk.eyJ1Ijoic2FtcGxlIn0.abc")).toBeNull();
    expect(staticRouteMapUrl(pts, null)).toBeNull();
    expect(staticRouteMapUrl([[1, 2]], PK)).toBeNull();
    expect(staticRouteMapUrl(pts, PK, { color: "red)/../x" })).toBeNull();
  });
});

describe("Phase 7b errors and links", () => {
  it("maps the new server errors", () => {
    expect(mapError({ code: "P0001", message: "club_name_taken" })).toEqual({ key: "clubNameTaken", field: "name" });
    expect(mapError({ code: "P0001", message: "owner_cannot_leave" }).key).toBe("ownerCannotLeave");
    expect(mapError({ code: "P0001", message: "route_not_public" }).key).toBe("routeNotPublic");
    expect(mapError({ code: "P0001", message: "route_required" }).key).toBe("routeNotPublic");
    expect(mapError({ code: "P0001", message: "club_member_required" }).key).toBe("clubMemberRequired");
    expect(ERROR_COPY.deletePost.destructive).toBe(true);
  });

  it("club and post pages are public links", () => {
    expect(isPublicPath(`/clubs/${E}`)).toBe(true);
    expect(isPublicPath(`/posts/${E}`)).toBe(true);
    expect(isPublicPath("/clubs/not-an-id")).toBe(false);
  });
});
