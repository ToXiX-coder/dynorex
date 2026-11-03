import { categoryForModName } from "@/domain/catalog";
import { formatMoney, parseMoney } from "@/domain/money";
import type { ModCategoryId } from "@/domain/validation/build";
import type {
  ListingCondition,
  ListingInput,
  ListingStatus,
  OfferStatus,
  PublicListing,
} from "@/services/supabase/database.types";

/**
 * The Shop (D-56): a parts marketplace inside Paddock. Dynorex doesn't handle payment yet: buyers make offers,
 * sellers accept one, and the two settle in person. The rules here mirror the database (migration
 * 20261018000000_shop.sql); the server enforces them.
 */
export const LISTING_LIMIT = { free: 5, plus: 25 } as const;
export const MAX_PRICE_MINOR = 10_000_000; // $100,000
export const SHOP_CURRENCY = "USD";

export const CONDITIONS: readonly { id: ListingCondition; label: string; detail: string }[] = [
  { id: "new", label: "New", detail: "Never installed" },
  { id: "like_new", label: "Like new", detail: "Installed briefly, no wear" },
  { id: "used", label: "Used", detail: "Normal wear, works as it should" },
  { id: "for_parts", label: "For parts", detail: "Damaged or untested" },
];
export const conditionLabel = (c: ListingCondition) => CONDITIONS.find((x) => x.id === c)?.label ?? c;

export const STATUS_LABEL: Record<ListingStatus, string> = { active: "For sale", pending: "On hold", sold: "Sold" };
export const OFFER_LABEL: Record<OfferStatus, string> = {
  open: "Waiting for the seller",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

/** "$450", "$12.50", "Free". */
export function priceText(minor: number, currency = SHOP_CURRENCY): string {
  if (minor === 0) return "Free";
  const s = formatMoney(minor, currency);
  return minor % 100 === 0 ? s.replace(/[.,]00(?!\d)/, "") : s;
}

/** Dollars typed by a person -> cents, or an error message. Blank is an error: a price is required. */
export function parsePrice(text: string): { ok: true; minor: number } | { ok: false; message: string } {
  const minor = parseMoney(text.replace(/^\$/, ""), SHOP_CURRENCY);
  if (minor === null) return { ok: false, message: "Add a price (0 for free)" };
  if (Number.isNaN(minor)) return { ok: false, message: "Use a number like 450 or 12.50" };
  if (minor > MAX_PRICE_MINOR) return { ok: false, message: "Keep it under $100,000" };
  return { ok: true, minor };
}

export type ListingDraft = {
  title: string;
  description: string;
  category: ModCategoryId | null;
  condition: ListingCondition | null;
  price: string;
  fits: string;
  location: string;
};
export type DraftErrors = Partial<Record<keyof ListingDraft, string>>;
const CONTROL = /[\x01-\x1F\x7F]/;

/** Check a listing form the same way the database will. */
export function validateListing(
  d: ListingDraft,
): { ok: true; value: ListingInput } | { ok: false; errors: DraftErrors } {
  const e: DraftErrors = {};
  const title = d.title.trim();
  if (title.length < 3) e.title = "Use at least 3 characters";
  else if (title.length > 80) e.title = "Keep it under 80 characters";
  else if (CONTROL.test(title)) e.title = "Remove special characters";
  const description = d.description.trim();
  if (description.length > 2000) e.description = "Keep it under 2,000 characters";
  if (!d.category) e.category = "Pick a category";
  if (!d.condition) e.condition = "Pick a condition";
  const price = parsePrice(d.price);
  if (!price.ok) e.price = price.message;
  const fits = d.fits.trim();
  if (fits.length > 120) e.fits = "Keep it under 120 characters";
  const location = d.location.trim();
  if (location.length < 2) e.location = "Add a city or area";
  else if (location.length > 80) e.location = "Keep it under 80 characters";
  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    value: {
      title,
      description: description || null,
      category: d.category!,
      condition: d.condition!,
      price_minor: (price as { minor: number }).minor,
      fits: fits || null,
      location_text: location,
    },
  };
}

/** Category guess from the listing title, the same keyword rules as mods ("Cat-back exhaust" -> exhaust). */
export const categoryForListingTitle = (title: string): ModCategoryId | null => categoryForModName(title);

/** Browse order (the server query sorts the same way): for sale, on hold, sold; boosted first; then newest. */
const STATUS_RANK: Record<ListingStatus, number> = { active: 0, pending: 1, sold: 2 };
export function sortListings(a: PublicListing, b: PublicListing): number {
  return (
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    Number(b.boosted) - Number(a.boosted) ||
    b.created_at.localeCompare(a.created_at)
  );
}

/** Search words: letters and digits only (so they're safe in an ilike pattern), at most 5. */
export const searchWords = (query: string) => (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 5);

/** Every word must appear in the title or fitment; the same rule as the server query. */
export function matchesListing(l: PublicListing, query: string, category: ModCategoryId | null): boolean {
  if (category && l.category !== category) return false;
  const hay = `${l.title} ${l.fits ?? ""}`.toLowerCase();
  return searchWords(query).every((w) => hay.includes(w));
}
