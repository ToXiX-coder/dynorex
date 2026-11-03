import { describe, expect, it } from "vitest";
import {
  normalizeWebsite,
  requestDateOk,
  servicePrice,
  validateBusiness,
  validateService,
  type BusinessDraft,
} from "@/domain/services";

const biz = (over: Partial<BusinessDraft> = {}): BusinessDraft => ({
  name: "Sample Speed Shop",
  about: "",
  location: "Sample City",
  website: "",
  phone: "",
  specialties: ["engine"],
  ...over,
});

describe("Services: pricing text", () => {
  it("never shows a number for quote-only services", () => {
    expect(servicePrice({ price_type: "fixed", price_minor: 12000, currency: "USD" })).toBe("$120");
    expect(servicePrice({ price_type: "from", price_minor: 45000, currency: "USD" })).toBe("From $450");
    expect(servicePrice({ price_type: "quote", price_minor: null, currency: "USD" })).toBe("Ask for a quote");
  });
});

describe("Services: business page form", () => {
  it("upgrades and completes web addresses the way the database requires (https only)", () => {
    expect(normalizeWebsite("sample-shop.com")).toBe("https://sample-shop.com");
    expect(normalizeWebsite("http://sample-shop.com")).toBe("https://sample-shop.com");
    expect(normalizeWebsite("  ")).toBeNull();
    expect(validateBusiness(biz({ website: "sample-shop.com" }))).toMatchObject({
      ok: true,
      value: { website: "https://sample-shop.com", phone: null, about: null },
    });
  });
  it("names each problem", () => {
    const v = validateBusiness(biz({ name: "x", location: "", phone: "call me", website: "not a site" }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["location", "name", "phone", "website"]);
  });
});

describe("Services: service form", () => {
  it("quote-only services carry no price; priced ones need one", () => {
    expect(
      validateService({
        name: "Custom wiring",
        description: "",
        category: "electronics",
        priceType: "quote",
        price: "99",
      }),
    ).toMatchObject({
      ok: true,
      value: { price_type: "quote", price_minor: null },
    });
    expect(
      validateService({ name: "Alignment", description: "", category: "suspension", priceType: "fixed", price: "" }).ok,
    ).toBe(false);
    expect(
      validateService({ name: "Alignment", description: "", category: "suspension", priceType: "fixed", price: "120" }),
    ).toMatchObject({
      ok: true,
      value: { price_minor: 12000 },
    });
  });
  it("preferred dates: today through a year out", () => {
    const today = new Date(2026, 9, 10);
    expect(requestDateOk(null, today)).toBe(true);
    expect(requestDateOk("2026-10-10", today)).toBe(true);
    expect(requestDateOk("2026-10-09", today)).toBe(false);
    expect(requestDateOk("2027-10-11", today)).toBe(false);
  });
});
