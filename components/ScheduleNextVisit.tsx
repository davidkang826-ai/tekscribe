"use client";

import { useMemo, useState } from "react";
import { scheduleVisit } from "@/lib/supabase/visits";
import { TIME_OPTIONS, dateInputValue, combineDateTime } from "@/lib/times";

type CalPref = "google" | "apple";
const PREF_KEY = "tekscribe.calendar-pref";

function readPref(): CalPref | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === "google" || v === "apple" ? v : null;
  } catch {
    return null;
  }
}

/** Tomorrow, for the date input. */
function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dateInputValue(d);
}

/** 20260719T150000Z — the compact UTC format calendars want. */
function calStamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Step 4: put the next visit on the calendar. Creates a Google Calendar or
 * Apple Calendar (.ics) event, remembers which one the tech prefers, and
 * saves the visit so the Daily Digest can list it. Entirely skippable.
 */
export default function ScheduleNextVisit({
  customerName,
  jobTitle,
  nextSteps,
  noteId,
  customerAddress = "",
  customerRequests = [],
  onDone,
}: {
  customerName: string;
  customerAddress?: string;
  jobTitle: string;
  nextSteps: string[];
  customerRequests?: string[];
  noteId: string | null;
  onDone: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("08:00");
  const [busy, setBusy] = useState(false);
  const [pref, setPref] = useState<CalPref | null>(readPref);
  // On-site visit, or just a reminder to call the customer.
  const [kind, setKind] = useState<"visit" | "call">("visit");
  // Prefill the address with what the tech entered on the note.
  const [address, setAddress] = useState(customerAddress);

  // Prefill "what the next visit is for" from the AI note: the follow-ups
  // and things the customer asked for (purchases stay off, they're the tech's
  // own list, kept in the body as a bring-list). The tech can edit it.
  const [todo, setTodo] = useState(() => {
    const steps = nextSteps.filter((s) => !/^buy\s*:/i.test(s.trim()));
    const source = steps.length ? steps : customerRequests;
    return source
      .slice(0, 3)
      .map((s) => s.trim().replace(/\.+$/, ""))
      .join(". ");
  });

  const reason = `${jobTitle}${customerName ? ` - ${customerName}` : ""}`;
  const bringList = useMemo(
    () =>
      nextSteps
        .filter((s) => /^buy\s*:/i.test(s.trim()))
        .map((s) => s.replace(/^buy\s*:\s*/i, ""))
        .join(", "),
    [nextSteps]
  );

  function eventPieces() {
    const start = combineDateTime(date, time);
    // A call reminder is a 15-minute block; an on-site visit reserves an hour.
    const minutes = kind === "call" ? 15 : 60;
    const end = new Date(start.getTime() + minutes * 60 * 1000);
    const who = customerName || jobTitle;
    const title = kind === "call" ? `Call ${who}` : `Next visit: ${who}`;
    const lines = [reason];
    if (todo.trim()) lines.push(`To do: ${todo.trim()}`);
    if (kind === "visit" && bringList) lines.push(`Bring: ${bringList}`);
    if (noteId)
      lines.push(`Previous visit in TekScribe: ${window.location.origin}/notes/${noteId}`);
    const location = kind === "visit" ? address.trim() : "";
    return { start, end, title, description: lines.join("\n"), location };
  }

  async function saveToDigest(start: Date) {
    try {
      await scheduleVisit({
        noteId,
        customerName,
        reason,
        todo: todo.trim(),
        kind,
        address: kind === "visit" ? address.trim() : "",
        scheduledAtIso: start.toISOString(),
      });
    } catch {
      // Calendar event still exists; the digest entry is best-effort.
    }
  }

  async function addGoogle() {
    if (busy) return;
    setBusy(true);
    setPref("google");
    try {
      localStorage.setItem(PREF_KEY, "google");
    } catch {
      // fine
    }
    const { start, end, title, description, location } = eventPieces();
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: `${calStamp(start)}/${calStamp(end)}`,
      details: description,
    });
    if (location) p.set("location", location);
    window.open(`https://calendar.google.com/calendar/render?${p}`, "_blank");
    await saveToDigest(start);
    setBusy(false);
    onDone();
  }

  async function addApple() {
    if (busy) return;
    setBusy(true);
    setPref("apple");
    try {
      localStorage.setItem(PREF_KEY, "apple");
    } catch {
      // fine
    }
    const { start, end, title, description, location } = eventPieces();
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TekScribe//EN",
      "BEGIN:VEVENT",
      `UID:${noteId || "visit"}-${start.getTime()}@tekscribe`,
      `DTSTAMP:${calStamp(new Date())}`,
      `DTSTART:${calStamp(start)}`,
      `DTEND:${calStamp(end)}`,
      `SUMMARY:${icsEscape(title)}`,
      ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
      `DESCRIPTION:${icsEscape(description)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([ics], { type: "text/calendar" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "next-visit.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    await saveToDigest(start);
    setBusy(false);
    onDone();
  }

  // Show the calendar they used last time first.
  const googleFirst = pref !== "apple";
  const googleBtn = (
    <button
      key="g"
      type="button"
      onClick={addGoogle}
      disabled={busy}
      className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition disabled:opacity-60 ${
        googleFirst
          ? "bg-brand text-white hover:bg-brand-600"
          : "bg-surface text-foreground ring-1 ring-border hover:bg-slate-50"
      }`}
    >
      Add to Google Calendar
    </button>
  );
  const appleBtn = (
    <button
      key="a"
      type="button"
      onClick={addApple}
      disabled={busy}
      className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition disabled:opacity-60 ${
        !googleFirst
          ? "bg-brand text-white hover:bg-brand-600"
          : "bg-surface text-foreground ring-1 ring-border hover:bg-slate-50"
      }`}
    >
      Add to Apple Calendar
    </button>
  );

  return (
    <div className="tt-fade-in mt-4">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground">
          Schedule the next visit?
        </h3>

        {/* On-site visit, or just a nudge to pick up the phone */}
        <div className="mt-4 inline-flex rounded-full bg-slate-100 p-1">
          {(
            [
              ["visit", "🔧 On-site visit"],
              ["call", "📞 Reminder to call"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                kind === k
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === "visit" && (
          <div className="mt-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Seattle, WA"
              autoComplete="street-address"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        )}

        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
            {kind === "call" ? "What the call is for" : "What this visit is for"}
          </label>
          <textarea
            value={todo}
            onChange={(e) => setTodo(e.target.value)}
            rows={2}
            placeholder="e.g. Install the new shutoff valve and check the upstairs sink"
            className="w-full rounded-lg border border-border bg-surface p-3 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {bringList && (
            <p className="mt-1 text-xs text-muted">Bring: {bringList}</p>
          )}
        </div>

        {/* Date and time on their own rows so neither gets cramped. */}
        <div className="mt-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div className="mt-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
            Time
          </label>
          {/* A native select: iOS renders it as a scroll wheel, like the
              Apple Calendar picker, in 5-minute steps. */}
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {googleFirst ? [googleBtn, appleBtn] : [appleBtn, googleBtn]}
        </div>

        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={onDone}
            className="text-xs font-medium text-muted hover:text-foreground transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
