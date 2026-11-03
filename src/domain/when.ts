/**
 * Human timestamps for lists: "just now", "12 min ago", "3 h ago", "Yesterday", "4 days ago", then a date
 * ("Oct 5", or "Oct 5, 2025" for another year). Future times (rare clock skew) read as "just now".
 */
export function whenText(iso: string | number | Date, now: Date = new Date()): string {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * A calendar day for lists: "Oct 23", or "Oct 23, 2025" in another year. A date-only string ("2026-10-23") stays on
 * its own day wherever the phone is; a timestamp shows the phone's local day.
 */
export function dayText(iso: string, now: Date = new Date()): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Today on the phone's own calendar as YYYY-MM-DD (not UTC, which is already tomorrow on a US evening). */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
