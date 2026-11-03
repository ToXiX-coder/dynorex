import { demoEventService } from "@/demo/v2";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { EventKind, EventRow, PublicEvent, RepeatRule, RsvpStatus } from "@/services/supabase/database.types";

/**
 * Paddock: events. Capacity, check-in codes and cancellation are enforced by server functions; the app
 * only shows what they return.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export type NewEvent = {
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location_text: string;
  capacity: number | null;
  /** "drive" = a group drive that follows a shared route (route_id required, checked by the server) */
  kind?: EventKind;
  route_id?: string | null;
  club_id?: string | null;
  /** the picked meeting place's coordinates, for the events map (both or neither) */
  place_lat?: number | null;
  place_lng?: number | null;
};
/** What an organizer can change before the event starts (the server refuses time changes after that). */
export type EventEdit = Partial<
  Pick<
    NewEvent,
    "title" | "description" | "starts_at" | "ends_at" | "location_text" | "capacity" | "place_lat" | "place_lng"
  >
>;

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: mapError(e) };
  }
}
function sb() {
  const c = getSupabase();
  if (!c) throw new Error("not_configured");
  return c;
}
function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

const realEventService = {
  upcoming: (page = 0) => run(async () => must(await sb().rpc("upcoming_events", { p_page: page })) as PublicEvent[]),
  publicEvent: (id: string) =>
    run(
      async () =>
        must(await sb().from("public_events").select("*").eq("event_id", id).maybeSingle()) as PublicEvent | null,
    ),
  /** The full row only comes back for the organizer (RLS); null for everyone else. */
  asOrganizer: (id: string) =>
    run(async () => must(await sb().from("events").select("*").eq("id", id).maybeSingle()) as EventRow | null),
  myRsvp: (id: string) =>
    run(async () => {
      const r = must(await sb().from("event_rsvps").select("status").eq("event_id", id).maybeSingle()) as {
        status: RsvpStatus;
      } | null;
      return r?.status ?? null;
    }),
  myCheckin: (id: string) =>
    run(async () =>
      Boolean(must(await sb().from("event_checkins").select("event_id").eq("event_id", id).maybeSingle())),
    ),
  /** D-68 (Build Wrapped): how many meets you checked in at between two times (your own rows only, by RLS). */
  myCheckinCount: (fromIso: string, toIso: string) =>
    run(async () => {
      const { count, error } = await sb()
        .from("event_checkins")
        .select("event_id", { count: "exact", head: true })
        .gte("checked_in_at", fromIso)
        .lt("checked_in_at", toIso);
      if (error) throw error;
      return count ?? 0;
    }),
  rsvp: (id: string, status: RsvpStatus) =>
    run(async () => must(await sb().rpc("rsvp_event", { p_event: id, p_status: status })) as string),
  cancelRsvp: (id: string) =>
    run(async () => {
      must(await sb().rpc("cancel_rsvp", { p_event: id }));
    }),
  create: (input: NewEvent) =>
    run(async () => (must(await sb().from("events").insert(input).select("id").single()) as { id: string }).id),
  update: (id: string, patch: EventEdit) =>
    run(async () => {
      const rows = must(await sb().from("events").update(patch).eq("id", id).select("id")) as { id: string }[];
      if (!rows.length) throw { code: "P0002", message: "not_found" }; // not yours, gone, or cancelled
    }),
  cancel: (id: string) =>
    run(async () => {
      must(await sb().rpc("cancel_event", { p_event: id }));
    }),
  checkinCode: (id: string) =>
    run(
      async () =>
        (must(await sb().rpc("event_checkin_code", { p_event: id })) as { code: string; expires_at: string }[])[0]!,
    ),
  checkIn: (id: string, code: string) =>
    run(async () => {
      must(await sb().rpc("check_in_event", { p_event: id, p_code: code }));
    }),
  /** A repeating meet (D-60): every date is its own event; the whole series counts as one new event. */
  createSeries: (input: NewEvent, repeat: RepeatRule, count: number) =>
    run(async () => {
      const seriesId = must(
        await sb().rpc("create_event_series", {
          p_title: input.title,
          p_description: input.description,
          p_starts_at: input.starts_at,
          p_ends_at: input.ends_at,
          p_location_text: input.location_text,
          p_capacity: input.capacity,
          p_kind: input.kind ?? "meet",
          p_route_id: input.route_id ?? null,
          p_club_id: input.club_id ?? null,
          p_place_lat: input.place_lat ?? null,
          p_place_lng: input.place_lng ?? null,
          p_repeat: repeat,
          p_count: count,
        }),
      ) as string;
      // open the first date
      const first = must(
        await sb().from("events").select("id").eq("series_id", seriesId).order("starts_at").limit(1).single(),
      ) as { id: string };
      return first.id;
    }),
  /** The coming dates of this event's series (empty for a one-off). */
  seriesDates: (id: string) =>
    run(
      async () =>
        must(await sb().rpc("event_series_dates", { p_event: id })) as { event_id: string; starts_at: string }[],
    ),
  /** Organizer: cancel this date and every later one. */
  cancelSeries: (id: string) => run(async () => must(await sb().rpc("cancel_event_series", { p_event: id })) as number),
  attendance: (id: string) =>
    run(
      async () =>
        (
          must(await sb().rpc("event_attendance", { p_event: id })) as {
            going: number;
            interested: number;
            checked_in: number;
          }[]
        )[0]!,
    ),
};

export type EventServiceApi = typeof realEventService;
export const eventService: EventServiceApi = config.demoMode ? demoEventService : realEventService;
