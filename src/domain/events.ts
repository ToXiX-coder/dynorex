/** Paddock events: pure helpers for display and the create form. The server enforces every rule. */
export function formatEventTime(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${t(s)}–${t(e)}`;
}

export function spotsLeft(e: { capacity: number | null; going_count: number }): number | null {
  return e.capacity === null ? null : Math.max(0, e.capacity - Number(e.going_count));
}

/** Check-in is open from 1 hour before the start until the end (same window as the server). */
export function checkinOpen(e: { starts_at: string; ends_at: string; status: string }, now = Date.now()) {
  return e.status === "scheduled" && now >= Date.parse(e.starts_at) - 3_600_000 && now <= Date.parse(e.ends_at);
}

/** Build start/end from the form's chips: a day offset, a start time and a duration. */
export function eventWindow(dayOffset: number, hhmm: string, hours: number, from = new Date()) {
  const [h, m] = hhmm.split(":").map(Number);
  const start = new Date(from);
  start.setDate(start.getDate() + dayOffset);
  start.setHours(h ?? 0, m ?? 0, 0, 0);
  const end = new Date(start.getTime() + hours * 3_600_000);
  return { starts_at: start.toISOString(), ends_at: end.toISOString(), inPast: start.getTime() < from.getTime() };
}

/**
 * What the host's QR code holds: the event and the current 6-digit code, nothing else. Scanning only fills in
 * the code; the server still checks RSVP, the window and the 90-second expiry exactly as if it were typed.
 */
// The public event link, so a phone's own camera app opens the event page with the code filled in.
export function checkinQrPayload(eventId: string, code: string): string {
  return `https://dynorex.app/events/${eventId}?checkin=${code}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** The code from a scanned QR, only if it's a Dynorex check-in for this exact event; otherwise null. */
export function parseCheckinQr(data: string, eventId: string): string | null {
  if (typeof data !== "string" || data.length > 200) return null;
  const m = /^(?:dynorex:\/\/|https:\/\/dynorex\.app\/)events\/([0-9a-f-]{36})\?checkin=(\d{6})$/i.exec(data.trim());
  if (!m || !UUID.test(m[1]!) || m[1]!.toLowerCase() !== eventId.toLowerCase()) return null;
  return m[2]!;
}

/** Repeating meets (D-60): how often, and how many dates at most (the server allows 2 to 12). */
export const REPEAT_OPTIONS = [
  { id: "weekly", label: "Every week", step: { days: 7 } },
  { id: "biweekly", label: "Every 2 weeks", step: { days: 14 } },
  { id: "monthly", label: "Every month", step: { months: 1 } },
] as const;
export type RepeatId = (typeof REPEAT_OPTIONS)[number]["id"];
export const SERIES_MAX = 12;

/** The start and end of each date in a series, same time of day, matching create_event_series on the server. */
export function seriesDates(startsAt: string, endsAt: string, repeat: RepeatId, count: number) {
  const step = REPEAT_OPTIONS.find((r) => r.id === repeat)!.step;
  const s0 = new Date(startsAt);
  const len = Date.parse(endsAt) - s0.getTime();
  return Array.from({ length: Math.max(0, Math.min(count, SERIES_MAX)) }, (_, i) => {
    const s = new Date(s0);
    if ("months" in step) {
      // like Postgres '+ interval 1 month': a day past the month's end lands on its last day (Jan 31 -> Feb 28)
      const m = s0.getUTCMonth() + step.months * i;
      const last = new Date(Date.UTC(s0.getUTCFullYear(), m + 1, 0)).getUTCDate();
      s.setUTCDate(1);
      s.setUTCMonth(m);
      s.setUTCDate(Math.min(s0.getUTCDate(), last));
    } else s.setTime(s0.getTime() + step.days * i * 86_400_000);
    return { starts_at: s.toISOString(), ends_at: new Date(s.getTime() + len).toISOString() };
  });
}
