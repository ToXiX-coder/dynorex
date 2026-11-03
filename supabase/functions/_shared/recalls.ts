// Turns an NHTSA "recallsByVehicle" answer into the rows store_recalls() takes. Pure, so it is unit-tested.
// Answer shape (checked 2026-10-14): { Count, Message, results: [{ NHTSACampaignNumber, Component, Summary,
// Consequence, Remedy, ReportReceivedDate: "06/10/2017", parkIt, ... }] }.

export type RecallItem = {
  campaign: string;
  component: string | null;
  summary: string | null;
  consequence: string | null;
  remedy: string | null;
  reported_on: string | null;
  park_it: boolean;
};

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** "MM/DD/YYYY" to "YYYY-MM-DD"; anything else, or a date that doesn't exist, is null. */
export function usDate(v: unknown): string | null {
  const m = typeof v === "string" ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim()) : null;
  if (!m) return null;
  const iso = `${m[3]}-${m[1]}-${m[2]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export function toRecallItems(answer: unknown): RecallItem[] {
  const results = (answer as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const out: RecallItem[] = [];
  for (const r of results as Record<string, unknown>[]) {
    const campaign = typeof r?.NHTSACampaignNumber === "string" ? r.NHTSACampaignNumber.trim().toUpperCase() : "";
    if (!/^[0-9A-Z]{6,16}$/.test(campaign) || out.some((x) => x.campaign === campaign)) continue;
    out.push({
      campaign,
      component: text(r.Component, 300),
      summary: text(r.Summary, 4000),
      consequence: text(r.Consequence, 4000),
      remedy: text(r.Remedy, 4000),
      reported_on: usDate(r.ReportReceivedDate),
      park_it: r.parkIt === true,
    });
  }
  return out;
}

/** The NHTSA lookup for one make / model / year (public data, no key, never a VIN). */
export const recallsUrl = (make: string, model: string, year: number) =>
  `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make.trim())}&model=${encodeURIComponent(
    model.trim(),
  )}&modelYear=${year}`;
