import { describe, expect, it } from "vitest";
import {
  categoryForListingTitle,
  matchesListing,
  parsePrice,
  priceText,
  searchWords,
  sortListings,
  validateListing,
  type ListingDraft,
} from "@/domain/shop";
import type { PublicListing } from "@/services/supabase/database.types";

const draft = (over: Partial<ListingDraft> = {}): ListingDraft => ({
  title: "Cat-back exhaust",
  description: "",
  category: "exhaust",
  condition: "used",
  price: "450",
  fits: "",
  location: "Sample City",
  ...over,
});
const listing = (over: Partial<PublicListing> = {}): PublicListing => ({
  listing_id: "x",
  seller_username: "seller",
  title: "Coilovers",
  description: null,
  category: "suspension",
  condition: "used",
  price_minor: 65000,
  currency: "USD",
  fits: "2015-2021 VW GTI",
  location_text: "Sample City",
  has_photo: false,
  status: "active",
  created_at: "2026-10-01T00:00:00Z",
  boosted: false,
  ...over,
});

describe("Shop prices", () => {
  it("shows whole dollars without cents, and $0 as Free", () => {
    expect(priceText(45000)).toBe("$450");
    expect(priceText(1250)).toBe("$12.50");
    expect(priceText(0)).toBe("Free");
  });
  it("parses what people type, within the database's range", () => {
    expect(parsePrice("450")).toEqual({ ok: true, minor: 45000 });
    expect(parsePrice("$12.50")).toEqual({ ok: true, minor: 1250 });
    expect(parsePrice("1,200")).toEqual({ ok: true, minor: 120000 });
    expect(parsePrice("0")).toEqual({ ok: true, minor: 0 });
    expect(parsePrice("")).toMatchObject({ ok: false });
    expect(parsePrice("abc")).toMatchObject({ ok: false });
    expect(parsePrice("100001")).toMatchObject({ ok: false });
  });
});

describe("Shop listing form", () => {
  it("trims and accepts a good listing; blanks become null", () => {
    const v = validateListing(draft({ title: "  Cat-back exhaust ", fits: " " }));
    expect(v).toEqual({
      ok: true,
      value: {
        title: "Cat-back exhaust",
        description: null,
        category: "exhaust",
        condition: "used",
        price_minor: 45000,
        fits: null,
        location_text: "Sample City",
      },
    });
  });
  it("names every problem the database would refuse", () => {
    const v = validateListing(draft({ title: "ab", category: null, condition: null, price: "", location: "" }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["category", "condition", "location", "price", "title"]);
  });
  it("guesses the category from the title like mods do", () => {
    expect(categoryForListingTitle("Cat-back exhaust")).toBe("exhaust");
    expect(categoryForListingTitle("Coilovers")).toBe("suspension");
  });
});

describe("Shop browsing", () => {
  it("search words are safe for the server filter and match title or fitment", () => {
    expect(searchWords("GTI, 100%_off!")).toEqual(["gti", "100", "off"]);
    expect(matchesListing(listing(), "gti coilovers", null)).toBe(true);
    expect(matchesListing(listing(), "wrx", null)).toBe(false);
    expect(matchesListing(listing(), "", "engine")).toBe(false);
  });
  it("for sale first, boosted first, then newest; sold last", () => {
    const xs = [
      listing({ listing_id: "sold", status: "sold", created_at: "2026-10-09T00:00:00Z" }),
      listing({ listing_id: "old" }),
      listing({ listing_id: "new", created_at: "2026-10-05T00:00:00Z" }),
      listing({ listing_id: "boost", boosted: true }),
      listing({ listing_id: "hold", status: "pending", created_at: "2026-10-09T00:00:00Z" }),
    ];
    expect(xs.sort(sortListings).map((x) => x.listing_id)).toEqual(["boost", "new", "old", "hold", "sold"]);
  });
});
