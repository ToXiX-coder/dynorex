import { parsePrice, priceText } from "@/domain/shop";
import type { ModCategoryId } from "@/domain/validation/build";
import type {
  BusinessInput,
  PublicBusiness,
  ServiceInput,
  ServicePriceType,
  ServiceRequestStatus,
} from "@/services/supabase/database.types";

/**
 * Services (D-57): shops list what they do in Paddock and take quote or booking requests in the app. Dynorex
 * doesn't take payment or verify shops beyond the staff-granted business badge. These rules mirror migration
 * 20261019000000_business_services.sql; the server enforces them.
 */
export const MAX_SERVICES = 30;

export const PRICE_TYPES: readonly { id: ServicePriceType; label: string; detail: string }[] = [
  { id: "fixed", label: "Fixed price", detail: "The same price every time" },
  { id: "from", label: "Starting at", detail: "A starting price; the final price depends on the car" },
  { id: "quote", label: "Ask for a quote", detail: "No price shown; customers ask first" },
];

/** "$120", "From $450", "Ask for a quote". */
export function servicePrice(s: { price_type: ServicePriceType; price_minor: number | null; currency: string }) {
  if (s.price_type === "quote" || s.price_minor === null) return "Ask for a quote";
  const p = priceText(s.price_minor, s.currency);
  return s.price_type === "from" ? `From ${p}` : p;
}

export const REQUEST_LABEL: Record<ServiceRequestStatus, string> = {
  open: "Waiting for the shop",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Done",
};

const CONTROL = /[\x01-\x1F\x7F]/;
const WEBSITE = /^https:\/\/[^\s/$.?#][^\s]{1,200}$/;
const PHONE = /^\+?[0-9 ().-]{7,20}$/;

/** "sample-speed.example" -> "https://sample-speed.example"; http:// is upgraded; blank -> null. */
export function normalizeWebsite(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t.replace(/^http:\/\//i, "https://") : `https://${t}`;
}

export type BusinessDraft = {
  name: string;
  about: string;
  location: string;
  website: string;
  phone: string;
  specialties: ModCategoryId[];
};
export type BusinessErrors = Partial<Record<keyof BusinessDraft, string>>;

export function validateBusiness(
  d: BusinessDraft,
): { ok: true; value: BusinessInput } | { ok: false; errors: BusinessErrors } {
  const e: BusinessErrors = {};
  const name = d.name.trim();
  if (name.length < 2) e.name = "Use at least 2 characters";
  else if (name.length > 60) e.name = "Keep it under 60 characters";
  else if (CONTROL.test(name)) e.name = "Remove special characters";
  const about = d.about.trim();
  if (about.length > 2000) e.about = "Keep it under 2,000 characters";
  const location = d.location.trim();
  if (location.length < 2) e.location = "Add a city or area";
  else if (location.length > 80) e.location = "Keep it under 80 characters";
  const website = normalizeWebsite(d.website);
  if (website && !WEBSITE.test(website)) e.website = "Use a web address like sample-shop.com";
  const phone = d.phone.trim() || null;
  if (phone && !PHONE.test(phone)) e.phone = "Use digits, spaces, ( ) - or a leading +";
  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    value: { name, about: about || null, location_text: location, website, phone, specialties: d.specialties },
  };
}

export type ServiceDraft = {
  name: string;
  description: string;
  category: ModCategoryId | null;
  priceType: ServicePriceType;
  price: string;
};
export type ServiceErrors = Partial<Record<keyof ServiceDraft, string>>;

export function validateService(
  d: ServiceDraft,
): { ok: true; value: ServiceInput } | { ok: false; errors: ServiceErrors } {
  const e: ServiceErrors = {};
  const name = d.name.trim();
  if (name.length < 2) e.name = "Use at least 2 characters";
  else if (name.length > 80) e.name = "Keep it under 80 characters";
  else if (CONTROL.test(name)) e.name = "Remove special characters";
  const description = d.description.trim();
  if (description.length > 1000) e.description = "Keep it under 1,000 characters";
  if (!d.category) e.category = "Pick a category";
  let price_minor: number | null = null;
  if (d.priceType !== "quote") {
    const p = parsePrice(d.price);
    if (!p.ok) e.price = p.message;
    else price_minor = p.minor;
  }
  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    value: { name, description: description || null, category: d.category!, price_type: d.priceType, price_minor },
  };
}

/** A preferred date the server accepts: today through a year out. */
export function requestDateOk(iso: string | null, today = new Date()): boolean {
  if (!iso) return true;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const [y, m, dd] = iso.split("-").map(Number);
  const t = Date.UTC(y!, m! - 1, dd!);
  return t >= day(today) && t <= day(today) + 365 * 86_400_000;
}

/** Search words and specialty filter, applied the same way to sample data and the server query. */
export function matchesBusiness(b: PublicBusiness, words: string[], category: ModCategoryId | null): boolean {
  if (category && !b.specialties.includes(category)) return false;
  const hay = `${b.name} ${b.location_text} ${b.about ?? ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Verified first, then most jobs done, then newest. */
export function sortBusinesses(a: PublicBusiness, b: PublicBusiness): number {
  return (
    Number(b.verified) - Number(a.verified) ||
    b.jobs_completed - a.jobs_completed ||
    b.created_at.localeCompare(a.created_at)
  );
}
