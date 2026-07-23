// Shared helpers to hand an event off to the tech's Google or Apple calendar.
// Used by the recorder's schedule step and the Calendar tab's event form.

export type CalEvent = {
  start: Date;
  end: Date;
  title: string;
  description: string;
  location?: string;
};

/** 20260719T150000Z, the compact UTC stamp calendars want. */
function calStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsEscape(s: string): string {
  return (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Open Google Calendar with the event prefilled, in a new tab. */
export function openGoogleCalendar(e: CalEvent): void {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${calStamp(e.start)}/${calStamp(e.end)}`,
    details: e.description,
  });
  if (e.location) p.set("location", e.location);
  window.open(`https://calendar.google.com/calendar/render?${p}`, "_blank");
}

/** Hand the event to Apple Calendar as an .ics. Opening it as a data URL lets
 *  iOS show its "Add to Calendar" sheet; falls back to a download if the
 *  browser blocks the new tab. */
export function openAppleCalendar(e: CalEvent, uid: string): void {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TekScribe//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${calStamp(new Date())}`,
    `DTSTART:${calStamp(e.start)}`,
    `DTEND:${calStamp(e.end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    `DESCRIPTION:${icsEscape(e.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const dataUri = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  const opened = window.open(dataUri, "_blank");
  if (!opened) {
    const a = document.createElement("a");
    a.href = dataUri;
    a.download = "visit.ics";
    a.click();
  }
}
