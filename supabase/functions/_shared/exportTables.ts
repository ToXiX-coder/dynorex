// What "export my data" includes: [output key, table, column holding the caller's id (null: row-level
// security alone limits it to the caller, because the id column itself isn't readable), readable columns].
// The export runs as the caller, so row-level security limits every query to their own rows.
// tests/integration/export.test.ts fails if a table that references a user is missing from this list
// (or from EXPORT_EXCLUDED with a reason), so new features can't silently skip the export.
export const EXPORT_TABLES: readonly (readonly [key: string, table: string, column: string | null, columns?: string])[] = [
  ["profile", "users", "id"],
  ["vehicles", "vehicles", "owner_id"],
  ["builds", "builds", "owner_id"],
  ["mods", "mods", "owner_id"],
  ["mod_photos", "mod_photos", "owner_id"],
  ["following", "follows", "follower_id"],
  ["followers", "follows", "followee_id"],
  ["build_follows", "build_follows", "user_id"],
  ["wishlist", "wishlist_items", "owner_id"],
  ["blocks", "blocks", "blocker_id"],
  ["mutes", "mutes", "muter_id"],
  // reporter_id and details are not client-readable; RLS returns only your own reports
  ["reports_filed", "reports", null, "id, target_type, target_id, reason, status, created_at"],
  ["notifications", "notifications", "recipient_id"],
  ["notification_prefs", "notification_prefs", "user_id"],
  // Phase 5
  ["sticker_reactions", "build_reactions", "user_id"],
  // Phase 7: Line and Paddock (full tracks included: they are the owner's own data)
  ["routes", "routes", "owner_id"],
  ["route_ratings", "route_ratings", "user_id"],
  ["events_hosted", "events", "organizer_id"],
  ["event_rsvps", "event_rsvps", "user_id"],
  ["event_checkins", "event_checkins", "user_id"],
  ["clubs_owned", "clubs", "owner_id"],
  ["club_memberships", "club_members", "user_id"],
  ["posts", "posts", "author_id"],
  ["comments", "comments", "author_id"],
  ["post_likes", "post_likes", "user_id"],
  // Shop (D-56): your listings, the offers you made, and the offer-chat messages you sent
  ["shop_listings", "listings", "seller_id"],
  ["shop_offers_made", "listing_offers", "buyer_id"],
  ["shop_messages_sent", "listing_messages", "sender_id"],
  // Services (D-57): your business page and menu, requests you sent, and request-chat messages you sent
  ["business", "businesses", "owner_id"],
  ["business_services", "business_services", "owner_id"],
  ["service_requests_sent", "service_requests", "customer_id"],
  ["service_messages_sent", "service_request_messages", "sender_id"],
  // D-58: maintenance log, gallery photos, chat messages you sent, club join requests, saved items
  ["maintenance", "maintenance_records", "owner_id"],
  ["vehicle_photos", "vehicle_photos", "owner_id"],
  ["chat_messages_sent", "room_messages", "sender_id"],
  ["club_join_requests", "club_join_requests", "user_id"],
  ["saved", "saves", "user_id"],
  // D-60: performance runs, with your speed traces
  ["performance_runs", "perf_runs", "owner_id"],
  // D-61
  ["receipts", "receipts", "owner_id"],
  ["event_photos", "event_photos", "owner_id"],
  // D-62
  ["dyno_results", "dyno_results", "owner_id"],
  ["track_laps", "track_laps", "owner_id"],
  ["recalls_marked_done", "recall_dismissals", "owner_id"],
  // D-64
  ["record_edits", "record_revisions", "owner_id"],
  ["shop_confirmations", "record_confirmations", "owner_id"],
];

/** Tables that reference a user but are exported another way or hold no personal content, with why. */
export const EXPORT_EXCLUDED: Readonly<Record<string, string>> = {
  "notifications.actor_id": "someone else's notification; yours are exported by recipient_id",
  "subscriptions.user_id": "exported through my_subscription (store receipts stay server-side)",
  "reports.reporter_id": "exported as reports_filed (row-level security limits it to your own)",
  "blocks.blocked_id": "who blocked you stays private to them (safety)",
  "mutes.muted_id": "who muted you stays private to them",
  "subscription_events.user_id": "store webhook ledger; your plan is exported through my_subscription",
  "drive_positions.user_id": "a live position exists only during a group drive and is deleted 30 minutes after it ends",
};
