import { describe, expect, it } from "vitest";
import { categoryForModName } from "@/domain/catalog";
import { clampYmd, composeYmd, formatDuration, formatTime, from12h, parseYmd, to12h, windowAt } from "@/domain/pickers";
import { parseSuggestions, placeText, roundNear, sampleSuggestions, suggestUrl } from "@/domain/places";

describe("mod category from the name", () => {
  it.each([
    ["Garrett GTX turbo kit", "engine"],
    ["BC Racing coilovers", "suspension"],
    ["Invidia Q300 catback", "exhaust"],
    ["Stage 2 tune", "electronics"],
    ["COBB Accessport flash", "electronics"],
    ["Brembo GT front calipers", "safety"],
    ["Hawk HPS pads", "safety"],
    ["Enkei RPF1 wheels", "wheels"],
    ["Michelin PS4S tires", "wheels"],
    ["NRG steering wheel", "interior"],
    ["Recaro bucket seats", "interior"],
    ["APR GTC-200 wing", "aero"],
    ["Ceramic window tint", "exterior"],
    ["LED headlights", "electronics"],
    ["Brake lights", "electronics"],
    ["Valve springs", "engine"],
    ["Engine mounts", "engine"],
    ["Whiteline sway bar", "suspension"],
    ["Clutch and flywheel", "engine"],
    ["Wheel spacers", "wheels"],
  ])("%s -> %s", (name, cat) => {
    expect(categoryForModName(name)).toBe(cat);
  });

  it("can't-tell names leave the choice to the owner", () => {
    expect(categoryForModName("My custom widget")).toBeNull();
    expect(categoryForModName("")).toBeNull();
  });
});

describe("date, time and duration wheels", () => {
  it("dates stay real: Feb 31 snaps back, leap years count", () => {
    expect(composeYmd(2026, 2, 31)).toBe("2026-02-28");
    expect(composeYmd(2028, 2, 31)).toBe("2028-02-29");
    expect(parseYmd("2026-02-30")).toBeNull();
    expect(parseYmd("2026-10-14")).toEqual({ y: 2026, m: 10, d: 14 });
    expect(clampYmd("2026-01-01", "2026-10-08")).toBe("2026-10-08");
    expect(clampYmd("2030-01-01", undefined, "2027-10-08")).toBe("2027-10-08");
  });

  it("12-hour wheels round-trip to the 24-hour value the form stores", () => {
    expect(to12h("00:05")).toEqual({ h: 12, m: 5, pm: false });
    expect(to12h("12:30")).toEqual({ h: 12, m: 30, pm: true });
    expect(from12h(12, 0, false)).toBe("00:00");
    expect(from12h(12, 0, true)).toBe("12:00");
    expect(from12h(9, 15, true)).toBe("21:15");
    expect(formatTime("21:15")).toBe("9:15 PM");
  });

  it("durations read naturally", () => {
    expect(formatDuration(150)).toBe("2 h 30 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(45)).toBe("45 min");
  });

  it("an event window from the picked date, time and length (local time)", () => {
    const now = new Date(2026, 9, 8, 12, 0);
    const w = windowAt("2026-10-14", "21:00", 150, now);
    const s = new Date(w.starts_at);
    expect([s.getMonth(), s.getDate(), s.getHours()]).toEqual([9, 14, 21]);
    expect((Date.parse(w.ends_at) - Date.parse(w.starts_at)) / 60_000).toBe(150);
    expect(w.inPast).toBe(false);
    expect(windowAt("2026-10-08", "09:00", 60, now).inPast).toBe(true);
  });
});

describe("meeting place suggestions", () => {
  it("shares only a ~1 km rounded point with Mapbox, as lng,lat", () => {
    expect(roundNear({ lat: 37.774929, lng: -122.419416 })).toEqual({ lat: 37.77, lng: -122.42 });
    const url = new URL(suggestUrl("coffee", "pk.test", "sess-1", { lat: 37.774929, lng: -122.419416 }));
    expect(url.origin + url.pathname).toBe("https://api.mapbox.com/search/searchbox/v1/suggest");
    expect(url.searchParams.get("proximity")).toBe("-122.42,37.77");
    expect(url.searchParams.get("session_token")).toBe("sess-1");
    expect(new URL(suggestUrl("coffee", "pk.test", "s", null)).searchParams.has("proximity")).toBe(false);
  });

  it("parses suggestions defensively and builds the saved text", () => {
    const places = parseSuggestions({
      suggestions: [
        { name: "Night Owl Coffee", mapbox_id: "a", place_formatted: "Main St, Sample City", feature_type: "poi" },
        { name: "", mapbox_id: "b" },
        { name: "No id" },
        { name: "123 Main St", mapbox_id: "c", full_address: "123 Main St, Sample City", feature_type: "address" },
      ],
    });
    expect(places.map((p) => p.id)).toEqual(["a", "c"]);
    expect(placeText(places[0]!)).toBe("Night Owl Coffee, Main St, Sample City");
    expect(placeText(places[1]!)).toBe("123 Main St, Sample City");
    expect(places[1]!.kind).toBe("address");
    expect(parseSuggestions({ nope: true })).toEqual([]);
  });

  it("pitch mode answers from sample places, no network", () => {
    expect(sampleSuggestions("car park").length).toBeGreaterThan(0);
    expect(sampleSuggestions("x")).toEqual([]);
  });
});
