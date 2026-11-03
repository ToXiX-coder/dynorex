/**
 * "Add to calendar" for events (D-58): a standard iCalendar (.ics) file the phone hands to its calendar app.
 * Built on the device from the public event; nothing goes to a third party.
 */
const icsTime = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
/** RFC 5545 text escaping, plus folding long lines at 75 octets (approximated by characters). */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => line.match(/.{1,74}/g)!.join("\r\n ");

export function eventIcs(
  e: {
    event_id: string;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    location_text: string;
    place_lat?: number | null;
    place_lng?: number | null;
    url: string;
  },
  now = new Date(),
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dynorex//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.event_id}@dynorex.app`,
    `DTSTAMP:${icsTime(now.toISOString())}`,
    `DTSTART:${icsTime(e.starts_at)}`,
    `DTEND:${icsTime(e.ends_at)}`,
    `SUMMARY:${esc(e.title)}`,
    `LOCATION:${esc(e.location_text)}`,
    ...(e.place_lat != null && e.place_lng != null ? [`GEO:${e.place_lat.toFixed(5)};${e.place_lng.toFixed(5)}`] : []),
    `DESCRIPTION:${esc([e.description ?? "", `Event page: ${e.url}`].filter(Boolean).join("\n\n"))}`,
    `URL:${e.url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(e.title)}`,
    "TRIGGER:-PT2H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * D-68: a maintenance job's next due date as an all-day calendar entry with a 9 am alert, made on the phone from the
 * owner's own log. No link and nothing about the owner: it's their calendar, not a share.
 */
export function serviceIcs(
  job: { id: string; title: string; car: string; due_on: string; due_miles: number | null },
  now = new Date(),
): string {
  const day = job.due_on.replace(/-/g, "");
  const [y, m, d] = job.due_on.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10).replace(/-/g, "");
  const summary = `${job.title} due: ${job.car}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dynorex//Maintenance//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:maintenance-${job.id}@dynorex.app`,
    `DTSTAMP:${icsTime(now.toISOString())}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(
      [
        job.due_miles != null
          ? `Due on this date or at ${job.due_miles.toLocaleString("en-US")} mi, whichever comes first.`
          : "Due on this date.",
        "From your Dynorex maintenance log. Your owner's manual wins.",
      ].join("\n"),
    )}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(summary)}`,
    "TRIGGER:PT9H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A safe file name for the .ics. */
export const icsFileName = (title: string) =>
  `${
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "event"
  }.ics`;
