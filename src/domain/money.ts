/**
 * Money is integer minor units (cents) plus an ISO currency. Never floats for storage; currencies are
 * never added together.
 */
export const CURRENCIES = ["USD", "CAD", "GBP", "EUR", "AUD", "NZD", "JPY", "MXN"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Currencies without minor units. */
const ZERO_DECIMAL: Currency[] = ["JPY"];

export const minorDigits = (c: Currency) => (ZERO_DECIMAL.includes(c) ? 0 : 2);

/** "1,234.50" typed by a person -> 123450. Returns null for blank, NaN for bad input. */
export function parseMoney(input: string, currency: Currency): number | null {
  const s = input.trim().replace(/[,\s]/g, "");
  if (s === "") return null;
  const digits = minorDigits(currency);
  const re = digits === 0 ? /^\d{1,11}$/ : /^\d{1,9}(\.\d{1,2})?$/;
  if (!re.test(s)) return NaN;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 10 ** digits + Number((frac + "00").slice(0, digits) || 0);
}

export function formatMoney(minor: number, currency: Currency | string): string {
  const c = currency as Currency;
  const digits = CURRENCIES.includes(c) ? minorDigits(c) : 2;
  const value = minor / 10 ** digits;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}

/** Which statuses count where. Shown in the UI next to the totals. */
export const COST_RULES = {
  spent: ["complete", "in_progress"],
  planned: ["planned"],
} as const;

export interface CostRow {
  currency: string;
  category: string;
  spent_minor: number;
  planned_minor: number;
}

/** Per-currency totals plus each category's share of spending, for the chart and its text legend. */
export function summariseCosts(rows: CostRow[]) {
  const byCurrency = new Map<
    string,
    { spent: number; planned: number; categories: { category: string; spent: number; share: number }[] }
  >();
  for (const r of rows) {
    const t = byCurrency.get(r.currency) ?? { spent: 0, planned: 0, categories: [] };
    t.spent += Number(r.spent_minor);
    t.planned += Number(r.planned_minor);
    if (Number(r.spent_minor) > 0) t.categories.push({ category: r.category, spent: Number(r.spent_minor), share: 0 });
    byCurrency.set(r.currency, t);
  }
  for (const t of byCurrency.values()) {
    t.categories.sort((a, b) => b.spent - a.spent);
    for (const c of t.categories) c.share = t.spent > 0 ? c.spent / t.spent : 0;
  }
  return [...byCurrency.entries()].map(([currency, t]) => ({ currency, ...t }));
}

/**
 * D-68: a car's budget against spent and planned costs in the same currency (other currencies are never converted).
 * Shares are of the budget, capped so the bar never overflows; `left` goes negative when it's over.
 */
export function budgetStatus(budget: number, spent: number, planned: number) {
  const spentShare = budget > 0 ? Math.min(1, spent / budget) : spent > 0 ? 1 : 0;
  const plannedShare = budget > 0 ? Math.min(1 - spentShare, planned / budget) : 0;
  return { left: budget - spent - planned, over: spent + planned > budget, spentShare, plannedShare };
}
