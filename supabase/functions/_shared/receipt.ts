// Receipt scan (D-68): the instructions, the one tool the model must answer with, and the cleanup of its answer.
// Plain TypeScript (no Deno or SDK imports) so tests/unit/godmode.test.ts can check it.
//
// What leaves Dynorex for the model provider: the receipt photo the owner chose to scan (re-encoded on the phone,
// so no location or camera data). Nothing else: no account, car, VIN or other records. Nothing is stored.

export const RECEIPT_MODEL = "claude-opus-5-5";

export const RECEIPT_SYSTEM = `You read photos of receipts and invoices for car parts and shop work, and fill in the fields of a car owner's mod log.

Rules:
- Only report what is printed on the receipt. If a field isn't there or you can't read it, use null. Never guess a part number, brand, price or date.
- part: the main part or job, short and plain ("Coilovers", "Cat-back exhaust", "Stage 2 tune"). If there are several line items, pick the main car part or job, not shipping, tax or small hardware.
- brand: the part's maker if printed (e.g. "BC Racing"), not the store.
- part_number: the maker's part number or SKU for that line, exactly as printed.
- total: the amount paid for that part or job, including labour on the same receipt but not other parts. A number like 1449.99, no currency sign.
- currency: the ISO code (USD, CAD, GBP, EUR, AUD, NZD, JPY, MXN) if you can tell, else null.
- date: the purchase or work date as YYYY-MM-DD.
- shop: the business that sold or fitted it, if it's a shop or installer (not a marketplace like Amazon).
- If the photo isn't a receipt or invoice, set is_receipt to false and every other field to null.`;

export const RECEIPT_TOOL = {
  name: "receipt_fields",
  description: "The fields read off the receipt photo, with null for anything not printed or not readable.",
  input_schema: {
    type: "object",
    properties: {
      is_receipt: { type: "boolean" },
      part: { type: ["string", "null"] },
      brand: { type: ["string", "null"] },
      part_number: { type: ["string", "null"] },
      total: { type: ["number", "null"] },
      currency: { type: ["string", "null"] },
      date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      shop: { type: ["string", "null"] },
    },
    required: ["is_receipt", "part", "brand", "part_number", "total", "currency", "date", "shop"],
    additionalProperties: false,
  },
  strict: true,
} as const;

export type ReceiptFields = {
  part: string | null;
  brand: string | null;
  part_number: string | null;
  total: number | null;
  currency: string | null;
  date: string | null;
  shop: string | null;
};

const CURRENCIES = ["USD", "CAD", "GBP", "EUR", "AUD", "NZD", "JPY", "MXN"];

const text = (v: unknown, max: number) => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/**
 * The model's answer, checked like any other untrusted input before it reaches the app: right types, the form's
 * length limits, a real date that isn't in the future, a sane amount. Anything off becomes null; "not a receipt"
 * becomes null overall.
 */
export function cleanReceipt(input: unknown, today = new Date()): ReceiptFields | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (r.is_receipt !== true) return null;
  const total = typeof r.total === "number" && Number.isFinite(r.total) && r.total > 0 && r.total < 1e7 ? r.total : null;
  const currency = typeof r.currency === "string" && CURRENCIES.includes(r.currency.toUpperCase()) ? r.currency.toUpperCase() : null;
  const date =
    typeof r.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
    !Number.isNaN(Date.parse(r.date)) &&
    r.date >= "1950-01-01" &&
    r.date <= today.toISOString().slice(0, 10)
      ? r.date
      : null;
  const out: ReceiptFields = {
    part: text(r.part, 120),
    brand: text(r.brand, 80),
    part_number: text(r.part_number, 80),
    total: total === null ? null : Math.round(total * 100) / 100,
    currency,
    date,
    shop: text(r.shop, 80),
  };
  return Object.values(out).some((v) => v !== null) ? out : null;
}
