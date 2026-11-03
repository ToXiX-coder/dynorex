/**
 * Values behind the scroll-wheel pickers (dates, times, durations). Plain local-time strings so forms and the
 * database keep their existing formats: dates "YYYY-MM-DD", times "HH:MM" (24 h), durations in minutes.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseYmd(s: string | null | undefined): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

/** month is 1–12 */
export const daysInMonth = (y: number, month: number) => new Date(y, month, 0).getDate();

/** Build a valid date from wheel positions; a day past the month's end snaps back (Feb 31 -> Feb 28/29). */
export function composeYmd(y: number, month: number, day: number): string {
  return `${y}-${pad(month)}-${pad(Math.min(day, daysInMonth(y, month)))}`;
}

/** Keep a date inside [min, max] (both "YYYY-MM-DD"). */
export const clampYmd = (s: string, min?: string, max?: string) => (min && s < min ? min : max && s > max ? max : s);

export function formatYmd(s: string): string {
  const p = parseYmd(s);
  if (!p) return "";
  return new Date(p.y, p.m - 1, p.d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------- times

export function to12h(hhmm: string): { h: number; m: number; pm: boolean } {
  const [hh = 9, mm = 0] = hhmm.split(":").map(Number);
  return { h: hh % 12 === 0 ? 12 : hh % 12, m: mm, pm: hh >= 12 };
}

export function from12h(h: number, m: number, pm: boolean): string {
  const hh = (h % 12) + (pm ? 12 : 0);
  return `${pad(hh)}:${pad(m)}`;
}

export function formatTime(hhmm: string): string {
  const t = to12h(hhmm);
  return `${t.h}:${pad(t.m)} ${t.pm ? "PM" : "AM"}`;
}

// ---------------------------------------------------------------- durations

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ---------------------------------------------------------------- events

/** An event's start and end from a picked date, start time and length (local time). */
export function windowAt(dateYmd: string, hhmm: string, minutes: number, now = new Date()) {
  const p = parseYmd(dateYmd) ?? parseYmd(ymd(now))!;
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const start = new Date(p.y, p.m - 1, p.d, h, m, 0, 0);
  const end = new Date(start.getTime() + minutes * 60_000);
  return { starts_at: start.toISOString(), ends_at: end.toISOString(), inPast: start.getTime() < now.getTime() };
}
