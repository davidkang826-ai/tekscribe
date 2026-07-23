export const runtime = "nodejs";

// A single-event .ics served from a real URL. iOS opens a hosted text/calendar
// file straight into the Calendar "Add Event" sheet, which a blob download or
// data URL often fails to do inside a web view. Stateless: the event is passed
// in the query string.

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(s: string): string {
  return (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const start = new Date(u.get("start") || "");
  const end = new Date(u.get("end") || "");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return new Response("Bad event", { status: 400 });
  }
  const title = u.get("title") || "Visit";
  const desc = u.get("desc") || "";
  const loc = u.get("loc") || "";
  const uid = u.get("uid") || `${start.getTime()}@tekscribe`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TekScribe//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${esc(uid)}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title)}`,
    ...(loc ? [`LOCATION:${esc(loc)}`] : []),
    ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(lines, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="visit.ics"',
      "Cache-Control": "no-store",
    },
  });
}
