import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// A private .ics feed of a tech's scheduled visits, addressed by the secret
// token in their profile. Calendar apps fetch this with no cookies, so the
// token IS the auth; it only ever exposes that one tech's own visits.

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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  if (!token || token.length < 20) {
    return new Response("Not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("calendar_token", token)
    .maybeSingle();
  if (!profile) return new Response("Not found", { status: 404 });

  const { data: visits } = await admin
    .from("scheduled_visits")
    .select("id, customer_name, reason, todo, kind, address, scheduled_at")
    .eq("user_id", profile.id)
    .order("scheduled_at", { ascending: true });

  // Customer directory for phone/email/address, so each event carries the
  // full contact even when the visit row itself only had a name.
  const contacts = new Map<
    string,
    { phone: string | null; email: string | null; address: string | null }
  >();
  const custFull = await admin
    .from("customers")
    .select("name, phone, email, address")
    .eq("user_id", profile.id);
  const custRows = custFull.error
    ? (
        await admin
          .from("customers")
          .select("name, phone, email")
          .eq("user_id", profile.id)
      ).data
    : custFull.data;
  for (const c of custRows ?? []) {
    const rec = c as {
      name: string;
      phone: string | null;
      email: string | null;
      address?: string | null;
    };
    contacts.set(rec.name.trim().toLowerCase(), {
      phone: rec.phone ?? null,
      email: rec.email ?? null,
      address: rec.address ?? null,
    });
  }

  const now = stamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TekScribe//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:TekScribe",
    "X-WR-TIMEZONE:UTC",
    // Ask subscribers to refresh roughly hourly.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const v of visits ?? []) {
    const start = new Date(v.scheduled_at as string);
    if (isNaN(start.getTime())) continue;
    const isCall = v.kind === "call";
    const mins = isCall ? 15 : 60;
    const end = new Date(start.getTime() + mins * 60 * 1000);
    const who = (v.customer_name as string) || (v.reason as string) || "Visit";
    const title = isCall ? `Call ${who}` : `Next visit: ${who}`;
    const contact = v.customer_name
      ? contacts.get((v.customer_name as string).trim().toLowerCase())
      : undefined;
    const address = (v.address as string) || contact?.address || "";

    // Everything the tech needs on the event, so the phone's calendar shows
    // the full picture: who, contact, what it's for.
    const descParts: string[] = [];
    if (v.customer_name) descParts.push(`Client: ${v.customer_name}`);
    if (contact?.phone) descParts.push(`Phone: ${contact.phone}`);
    if (contact?.email) descParts.push(`Email: ${contact.email}`);
    if (address) descParts.push(`Address: ${address}`);
    if (v.todo) descParts.push(`Notes: ${v.todo}`);
    else if (v.reason) descParts.push(v.reason as string);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${v.id}@tekscribe`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(title)}`
    );
    if (address) lines.push(`LOCATION:${esc(address)}`);
    if (contact?.phone) {
      // A tappable phone number on the event, where calendars support it.
      lines.push(`CONTACT:${esc(contact.phone)}`);
    }
    if (descParts.length)
      lines.push(`DESCRIPTION:${esc(descParts.join("\n"))}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": 'inline; filename="tekscribe.ics"',
    },
  });
}
