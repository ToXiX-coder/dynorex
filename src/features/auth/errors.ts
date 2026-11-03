import type { ErrorKey } from "@/domain/copy/errors";

/**
 * Turns anything Supabase (Auth, PostgREST, Edge Functions) or the network throws into one of the
 * spec's user-facing messages. Never surfaces codes, SQL or stack traces, and never logs the raw error.
 */
export interface MappedError {
  key: ErrorKey;
  /** For inline form errors (e.g. the username field). */
  field?: string;
  /** True when the person cancelled (Apple/Google sheet closed): show nothing. */
  cancelled?: boolean;
}

type Loose = { code?: unknown; status?: unknown; message?: unknown; name?: unknown };

export function mapError(e: unknown): MappedError {
  const err = (typeof e === "object" && e !== null ? e : {}) as Loose;
  const code = typeof err.code === "string" ? err.code : "";
  const message = typeof err.message === "string" ? err.message : "";
  const name = typeof err.name === "string" ? err.name : "";
  const status = typeof err.status === "number" ? err.status : 0;

  // the person closed the Apple/Google sheet
  if (code === "ERR_REQUEST_CANCELED" || code === "ERR_CANCELED" || message === "cancelled") {
    return { key: "signInFailed", cancelled: true };
  }
  // no connection
  if (name === "AuthRetryableFetchError" || /network request failed|failed to fetch|networkerror/i.test(message)) {
    return { key: "offline" };
  }
  if (message === "not_configured") return { key: "notConnected" };

  // Supabase Auth error codes
  switch (code) {
    case "invalid_credentials":
      return { key: "wrongPassword" };
    case "email_not_confirmed":
      return { key: "checkEmail" };
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "over_sms_send_rate_limit":
      return { key: "tooManyAttempts" };
    case "session_expired":
    case "session_not_found":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return { key: "sessionExpired" };
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return { key: "linkExpired" };
    case "reauthentication_needed":
    case "reauth_required":
      return { key: "reauthNeeded" };
    case "weak_password":
      return { key: "signInFailed", field: "password" };
    case "user_already_exists":
    case "email_exists":
    case "identity_already_exists":
      // Kept generic: don't confirm which emails have accounts.
      return { key: "signInFailed" };
  }

  // Database (PostgREST) errors raised by our migrations
  if (code === "P0001") {
    if (message.includes("rate_limited")) return { key: "rateLimited" };
    if (message.includes("email_not_verified")) return { key: "verifyFirst" };
    if (message.includes("username_required")) return { key: "saveFailed", field: "username" };
    if (message.includes("plan_limit_vehicles")) return { key: "planLimitVehicles" };
    if (message.includes("plan_limit_mods")) return { key: "planLimitMods" };
    if (message.includes("not_shareable")) return { key: "notShareable" };
    if (message.includes("sign_in_required")) return { key: "signInRequired" };
    if (message.includes("plus_required")) return { key: "paywall" };
    if (message.includes("plan_limit_routes")) return { key: "planLimitRoutes" };
    if (message.includes("route_too_short_to_share")) return { key: "routeTooShort" };
    if (message.includes("event_full")) return { key: "eventFull" };
    if (message.includes("event_closed")) return { key: "eventClosed" };
    if (message.includes("event_in_past") || message.includes("event_already_started")) return { key: "eventInPast" };
    if (message.includes("checkin_closed")) return { key: "checkinClosed" };
    if (message.includes("rsvp_required")) return { key: "rsvpRequired" };
    if (message.includes("invalid_code")) return { key: "invalidCode" };
    if (message.includes("club_name_taken")) return { key: "clubNameTaken", field: "name" };
    if (message.includes("owner_cannot_leave")) return { key: "ownerCannotLeave" };
    if (message.includes("route_not_public") || message.includes("route_required")) return { key: "routeNotPublic" };
    if (message.includes("club_member_required")) return { key: "clubMemberRequired" };
    if (message.includes("plan_limit_listings")) return { key: "planLimitListings" };
    if (message.includes("own_listing")) return { key: "ownListing" };
    if (message.includes("listing_unavailable")) return { key: "listingUnavailable" };
    if (message.includes("offer_exists")) return { key: "offerExists" };
    if (message.includes("offer_closed")) return { key: "offerClosed" };
    if (message.includes("accept_an_offer")) return { key: "acceptAnOffer" };
    if (message.includes("invalid_amount")) return { key: "saveFailed", field: "amount" };
    if (message.includes("service_limit")) return { key: "serviceLimit" };
    if (message.includes("not_in_room")) return { key: "notInRoom" };
    if (message.includes("drive_not_live")) return { key: "driveNotLive" };
    if (message.includes("club_private")) return { key: "clubPrivate" };
    if (message.includes("own_business")) return { key: "ownBusiness" };
    if (message.includes("request_exists")) return { key: "requestExists" };
    if (message.includes("request_closed")) return { key: "requestClosed" };
    if (message.includes("invalid_date")) return { key: "saveFailed", field: "date" };
    // D-64: Build Record
    if (message.includes("vehicle_sold")) return { key: "vehicleSold" };
    if (message.includes("inherited_entry")) return { key: "inheritedEntry" };
    if (message.includes("vin_locked")) return { key: "vinLocked" };
    if (message.includes("vin_required")) return { key: "vinRequired" };
    if (message.includes("emissions")) return { key: "emissionsConfirm" };
    if (message.includes("not_finished")) return { key: "notFinished" };
    if (message.includes("already_confirmed")) return { key: "alreadyConfirmed" };
  }
  if (code === "P0002") return { key: "buildNotFound" }; // not_found from publish_build
  if (code === "22023" && message.includes("invalid_route")) return { key: "invalidRoute" };
  if (code === "23505" && /username/.test(message)) return { key: "usernameTaken", field: "username" };
  if (code === "23505" && /businesses_name_uq/.test(message)) return { key: "businessNameTaken", field: "name" };
  if (code === "23505" && /businesses_owner_uq/.test(message)) return { key: "businessExists" };
  if (code === "23514") return { key: "saveFailed" }; // check constraint: app validation should have caught it
  if (code === "42501") return { key: "verifyFirst" }; // RLS refusal on reports/follows

  if (status === 429) return { key: "rateLimited" };
  if (status === 401) return { key: "sessionExpired" };
  if (status >= 500) return { key: "server" };
  return { key: "server" };
}
