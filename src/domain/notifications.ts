import type { NotificationCategory } from "@/services/supabase/database.types";

/**
 * Every notification category from the handoff spec's push table, in its order. Settings shows a
 * switch for each one. `live` says whether Dynorex can send it yet ("marketplace": only while the Shop is on,
 * "paddock": only while Paddock is on);
 * switches for the rest are still saved, so the choice is already in place when that feature ships.
 */
export const NOTIFICATION_CATEGORIES: readonly {
  id: NotificationCategory;
  label: string;
  live: boolean | "marketplace" | "paddock";
}[] = [
  { id: "new_follower", label: "New followers", live: true },
  { id: "build_update", label: "Updates to builds you follow", live: true },
  { id: "event_reminder", label: "Event reminders and cancellations", live: true },
  { id: "marketplace_offer_received", label: "Offers on your listings", live: "marketplace" },
  { id: "marketplace_offer_accepted", label: "Your offer was accepted", live: "marketplace" },
  { id: "marketplace_sale_complete", label: "Sale complete", live: "marketplace" },
  { id: "subscription_expiring", label: "Dynorex+ expiring soon", live: true },
  { id: "subscription_expired", label: "Dynorex+ expired", live: true },
  { id: "build_of_the_week", label: "Build of the Week", live: false },
  { id: "service_request_received", label: "Requests to your business", live: "marketplace" },
  { id: "service_request_update", label: "Replies to your service requests", live: "marketplace" },
  // D-61
  { id: "post_like", label: "Likes on your posts", live: "paddock" },
  { id: "post_comment", label: "Comments on your posts", live: "paddock" },
  { id: "club_event", label: "New meets in your clubs", live: "paddock" },
  // D-62
  { id: "recall", label: "Safety recalls that may affect your cars", live: true },
  { id: "wishlist_match", label: "Shop listings that match your wishlist", live: "marketplace" },
  // D-64
  { id: "record_confirm_request", label: "Customers asking your shop to confirm a job", live: "marketplace" },
  { id: "record_confirm_answer", label: "Shops answering about your Build Record", live: true },
];

/** No stored row means the category is on (the server uses the same default). */
export function prefEnabled(
  rows: readonly { category: NotificationCategory; enabled: boolean }[],
  id: NotificationCategory,
) {
  return rows.find((r) => r.category === id)?.enabled ?? true;
}

/** Whether this kind of notification is actually sent with the current feature flags. */
export const categoryLive = (
  c: (typeof NOTIFICATION_CATEGORIES)[number],
  flags: { marketplace: boolean; paddock?: boolean },
) =>
  c.live === true ||
  (c.live === "marketplace" && flags.marketplace) ||
  (c.live === "paddock" && Boolean(flags.paddock));
