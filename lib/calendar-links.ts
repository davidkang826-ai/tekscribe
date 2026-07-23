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

/** Hand the event to Apple Calendar via a hosted .ics link. iOS opens a real
 *  text/calendar URL straight into its "Add Event" sheet, which a data URL or
 *  blob download inside a web view often won't. */
export function openAppleCalendar(e: CalEvent, uid: string): void {
  const p = new URLSearchParams({
    title: e.title,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    desc: e.description,
    uid,
  });
  if (e.location) p.set("loc", e.location);
  window.open(`/api/ics?${p.toString()}`, "_blank");
}
