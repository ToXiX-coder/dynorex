/**
 * Dynorex+ facts the app displays (handoff spec 8.1). Entitlements themselves are decided on the server;
 * nothing here grants anything.
 */
export type PlanId = "monthly" | "annual";
export const PRODUCT_IDS: Record<PlanId, string> = {
  monthly: "dynorex_plus_monthly",
  annual: "dynorex_plus_annual",
};

export function planRowLive(a: PlanRowAvailability, flags: { line: boolean; paddock: boolean; marketplace: boolean }) {
  return typeof a === "boolean" ? a : flags[a];
}

/** US list prices from the spec. The store's own localized price string always wins when available. */
export const LIST_PRICES: Record<PlanId, { price: string; cadence: string; per: string }> = {
  monthly: { price: "$7.99", cadence: "month", per: "/month" },
  annual: { price: "$59.99", cadence: "year", per: "/year" },
};

/** `available`: true, or the feature flag that must be on for the row to count as live (otherwise "(later)"). */
export type PlanRowAvailability = boolean | "line" | "paddock" | "marketplace";
export const PLAN_COMPARISON: readonly {
  feature: string;
  free: string;
  plus: string;
  available: PlanRowAvailability;
}[] = [
  { feature: "Vehicles", free: "Up to 2", plus: "Unlimited", available: true },
  { feature: "Mods per vehicle", free: "Up to 20", plus: "Unlimited", available: true },
  { feature: "Specifications", free: "Basic", plus: "Advanced (projections, per-category)", available: true },
  { feature: "Build analytics", free: "None", plus: "Views, followers, engagement", available: true },
  { feature: "Torq stickers", free: "See them", plus: "Send all 12", available: true },
  { feature: "Profile badge", free: "No", plus: "Dynorex+ badge", available: true },
  { feature: "Route recordings", free: "5/month", plus: "Unlimited", available: "line" },
  { feature: "Stickers in Paddock comments", free: "No", plus: "All 12", available: "paddock" },
  {
    feature: "Shop listings",
    free: "5 up at once",
    plus: "25 up at once, boosted for 3 days",
    available: "marketplace",
  },
  { feature: "Early access", free: "No", plus: "New features first", available: false },
];

/** Required renewal and cancellation disclosure, shown next to the buy buttons. */
export function renewalDisclosure(plan: PlanId, price: string, store: "app_store" | "play_store" | null): string {
  const where =
    store === "play_store" ? "Google Play" : store === "app_store" ? "your Apple ID settings" : "your store settings";
  return (
    `${price} per ${LIST_PRICES[plan].cadence}, charged to your store account when you confirm. ` +
    `Renews automatically until you cancel. Cancel any time in ${where} at least 24 hours before renewal. ` +
    "Prices may include tax where applicable."
  );
}

export type SubStatus = "active" | "cancelled" | "grace" | "billing_retry" | "expired" | "refunded" | "revoked";

/** One plain sentence describing the server's subscription record. */
export function describeSubscription(s: {
  plus: boolean;
  status: SubStatus | null;
  product_id: string | null;
  expires_at: string | null;
  grace_until: string | null;
  via_override: boolean;
}): string {
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "an unknown date");
  const plan = s.product_id === PRODUCT_IDS.annual ? "yearly" : "monthly";
  if (s.via_override && !s.status) return "Dynorex+ is on for this account (staff or tester access).";
  switch (s.status) {
    case "active":
      return `Dynorex+ ${plan}. Renews on ${day(s.expires_at)}.`;
    case "cancelled":
      return s.plus
        ? `Dynorex+ ${plan}, cancelled. You keep it until ${day(s.expires_at)}.`
        : `Your Dynorex+ ended on ${day(s.expires_at)}.`;
    case "grace":
      return `Payment problem. Fix it in your store settings by ${day(s.grace_until)} to keep Dynorex+.`;
    case "billing_retry":
      return "Payment failed and Dynorex+ is paused. Update your payment method in your store settings.";
    case "expired":
      return `Your Dynorex+ expired on ${day(s.expires_at)}.`;
    case "refunded":
      return "This Dynorex+ purchase was refunded.";
    case "revoked":
      return "Dynorex+ moved to another account or was revoked by the store.";
    default:
      return "You're on the Free plan.";
  }
}

/** Where people manage or cancel (spec: clear platform management links). */
export const MANAGE_URLS = {
  app_store: "https://apps.apple.com/account/subscriptions",
  play_store: "https://play.google.com/store/account/subscriptions?package=app.dynorex",
} as const;

/** Spec sticker set: 12 at launch. `base` is the Torq pose the drawing starts from. */
export const STICKERS = [
  { id: "hype", name: "Hype", use: "Reacting to a sick build" },
  { id: "wrenching", name: "Wrenching", use: "Nice work on that mod" },
  { id: "burnout", name: "Burnout", use: "Speed and power appreciation" },
  { id: "shrug", name: "Shrug", use: "Idk man" },
  { id: "thumbs_up", name: "Thumbs Up", use: "General approval" },
  { id: "fire", name: "Fire", use: "This build is fire" },
  { id: "cop_spotted", name: "Cop Spotted", use: "Classic car culture joke" },
  { id: "rev_limiter", name: "Rev Limiter", use: "Blown away by a build" },
  { id: "track_ready", name: "Track Ready", use: "Track build appreciation" },
  { id: "sleeping", name: "Sleeping", use: "Friendly roast" },
  { id: "money_eyes", name: "Money Eyes", use: "Expensive build appreciation" },
  { id: "wave", name: "Torq Wave", use: "General greeting" },
] as const;
export type StickerId = (typeof STICKERS)[number]["id"];
