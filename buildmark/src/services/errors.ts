import { CONFIRM_BLOCK_COPY } from "@/domain/compliance";
import { ApiError } from "./api";

/** Error codes from the database (raised in supabase/migrations) and the client, in plain words. */
const COPY: Record<string, string> = {
  ...CONFIRM_BLOCK_COPY,
  not_owner: "Only the car's current owner can do that.",
  not_signed_in: "Sign in first.",
  car_limit: "You can keep up to 25 cars.",
  entry_limit: "A car can hold up to 500 entries.",
  receipt_limit: "An entry can hold up to 6 files.",
  future_date: "That date is in the future.",
  no_change: "Nothing changed.",
  reason_required: "Say why you're changing it. Buyers see the reason.",
  vin_already_set: "The VIN is already set. It can't be changed, so the record can't be moved to another car.",
  vin_required: "Add the VIN first. The buyer needs it to take over the record.",
  has_history: "This record has had more than one owner, so it can't be deleted.",
  file_missing: "The upload didn't finish. Try again.",
  file_too_big: "Files can be up to 10 MB.",
  upload_failed: "The upload didn't finish. Try again.",
  rate_limited: "Too many tries. Wait an hour and try again.",
  not_found: "That couldn't be found.",
  network: "Couldn't reach Buildmark. Check your connection.",
};

export function errorText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : "";
  const key = Object.keys(COPY).find((k) => code === k || code.includes(k));
  return key ? COPY[key]! : "Something went wrong. Try again.";
}
