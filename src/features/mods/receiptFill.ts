import { categoryForModName } from "@/domain/catalog";
import { CURRENCIES, minorDigits, type Currency } from "@/domain/money";
import type { ModFields } from "./ModFormView";

/** What the receipt-scan Edge Function reads off a receipt (D-68); null for anything not printed. */
export type ScannedReceipt = {
  part: string | null;
  brand: string | null;
  part_number: string | null;
  total: number | null;
  currency: string | null;
  date: string | null;
  shop: string | null;
};

const FIELD_NAMES: Partial<Record<keyof ModFields, string>> = {
  name: "name",
  brand: "brand",
  part_number: "part number",
  cost: "cost",
  installed_on: "date",
  installed_by: "fitted by",
};

/**
 * Puts a scan into the form without overwriting anything the owner typed: only blank fields fill. The category
 * follows the part name, like picking it from the list. Returns the form and which fields were filled.
 */
export function fillFromReceipt(fields: ModFields, r: ScannedReceipt): { fields: ModFields; filled: string[] } {
  const next = { ...fields };
  const filled: string[] = [];
  const put = (k: keyof ModFields, v: string | null) => {
    if (!v || fields[k].trim()) return;
    next[k] = v;
    if (FIELD_NAMES[k]) filled.push(FIELD_NAMES[k]!);
  };
  put("name", r.part);
  if (next.name !== fields.name && !fields.category) next.category = categoryForModName(next.name) || "";
  put("brand", r.brand);
  put("part_number", r.part_number);
  if (r.currency && (CURRENCIES as readonly string[]).includes(r.currency) && !fields.cost.trim()) {
    next.currency = r.currency;
  }
  if (r.total !== null) put("cost", r.total.toFixed(minorDigits(next.currency as Currency)));
  put("installed_on", r.date);
  put("installed_by", r.shop);
  return { fields: next, filled };
}
