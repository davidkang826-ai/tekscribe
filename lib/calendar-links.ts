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

/** A Google Calendar "add event" URL, for a real link (not window.open, which
 *  is unreliable inside an installed home-screen app). */
export function googleCalendarHref(e: CalEvent): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${calStamp(e.start)}/${calStamp(e.end)}`,
    details: e.description,
  });
  if (e.location) p.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** A hosted single-event .ics URL. Tapped as a real link, iOS opens it into
 *  the Calendar "Add Event" sheet right over the app. */
export function appleIcsHref(e: CalEvent, uid: string): string {
  const p = new URLSearchParams({
    title: e.title,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    desc: e.description,
    uid,
  });
  if (e.location) p.set("loc", e.location);
  return `/api/ics?${p.toString()}`;
}
