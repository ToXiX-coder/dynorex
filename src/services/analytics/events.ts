import { z } from "zod";

/**
 * Every analytics event the app may send, with the only properties it may carry.
 * Schemas are strict: unknown keys are rejected, so a username, email, VIN or coordinate
 * cannot ride along by accident. Source: handoff spec "Analytics Events".
 */
const authMethod = z.enum(["email", "google", "apple"]);
const modStatus = z.enum(["planned", "in_progress", "complete"]);
const screen = z.string().regex(/^[a-z0-9_/]{1,64}$/);
const empty = z.object({}).strict();

export const EVENT_SCHEMAS = {
  screen_view: z.object({ screen_name: screen, previous_screen: screen.nullable() }).strict(),
  sign_up_started: z.object({ method: authMethod }).strict(),
  sign_up_completed: z.object({ method: authMethod }).strict(),
  onboarding_completed: z.object({ build_goal_selected: z.string().max(32) }).strict(),
  onboarding_skipped: z.object({ step_skipped: z.number().int().min(1).max(3) }).strict(),
  vehicle_added: z.object({ make: z.string().max(50), model: z.string().max(50), year: z.number().int() }).strict(),
  mod_added: z
    .object({ category: z.string().max(20), status: modStatus, has_photos: z.boolean(), has_cost: z.boolean() })
    .strict(),
  mod_status_changed: z.object({ old_status: modStatus, new_status: modStatus }).strict(),
  build_shared: z.object({ share_method: z.enum(["link", "native", "card", "record"]) }).strict(),
  // D-64: the Build Record (how it was used; never ids, VINs, codes or shop names)
  record_sheet_exported: z.object({ format: z.enum(["text", "pdf", "ad"]) }).strict(),
  shop_confirmation_requested: z.object({ via: z.enum(["link", "shop_account"]) }).strict(),
  record_transfer_started: empty,
  record_claimed: empty,
  // D-63 / D-66: which "Start your Build Record" step was opened (no ids, no content)
  first_build_step_opened: z.object({ step: z.enum(["car", "mod", "paperwork", "share"]) }).strict(),
  // D-63: proof of what a build does was saved (the activation metric); kind only, never the numbers
  proof_logged: z.object({ kind: z.enum(["run", "dyno", "laps", "receipt"]) }).strict(),
  build_followed: empty,
  build_unfollowed: empty,
  discover_opened: empty,
  search_performed: z.object({ result_count: z.number().int().min(0), has_results: z.boolean() }).strict(),
  upgrade_tapped: z.object({ source_screen: screen }).strict(),
  paywall_dismissed: z.object({ source_screen: screen }).strict(),
  subscription_started: z.object({ plan: z.enum(["monthly", "annual"]) }).strict(),
  subscription_cancelled: empty,
  photo_uploaded: z.object({ count: z.number().int().min(1).max(50), source: z.enum(["camera", "library"]) }).strict(),
  error_shown: z.object({ error_type: z.string().max(40), screen_name: screen }).strict(),
  notification_tapped: z.object({ notification_type: z.string().max(40) }).strict(),
} as const;

export type EventName = keyof typeof EVENT_SCHEMAS;
export type EventProps<N extends EventName> = z.infer<(typeof EVENT_SCHEMAS)[N]>;

export interface AnalyticsEvent {
  name: EventName;
  props: Record<string, unknown>;
  /** Random per-install ID. Never the user ID, email or device ID. */
  anonymousId: string;
  platform: "ios" | "android" | "web";
  ts: number;
}
