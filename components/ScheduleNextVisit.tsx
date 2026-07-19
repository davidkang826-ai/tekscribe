"use client";

import { useMemo, useState } from "react";
import { scheduleVisit } from "@/lib/supabase/visits";

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

/** Tomorrow at 8:00 AM local, in datetime-local input format. */
function defaultWhen(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
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
  onDone,
}: {
  customerName: string;
  jobTitle: string;
  nextSteps: string[];
  noteId: string | null;
  onDone: () => void;
}) {
  const [when, setWhen] = useState(defaultWhen);
  const [busy, setBusy] = useState(false);
  const [pref, setPref] = useState<CalPref | null>(readPref);

  // What the next visit is for, from the note's next steps (purchases are the
  // tech's own list, so they stay out of the calendar title but keep the
  // "Buy:" items in the body as a bring-list).
  const [todo, setTodo] = useState(() => {
    const items = nextSteps.filter((s) => !/^buy\s*:/i.test(s.trim()));
    return items.slice(0, 3).join(". ");
  });

  const reason = `${jobTitle}${customerName ? ` — ${customerName}` : ""}`;
  const bringList = useMemo(
    () =>
      nextSteps
        .filter((s) => /^buy\s*:/i.test(s.trim()))
        .map((s) => s.replace(/^buy\s*:\s*/i, ""))
        .join(", "),
    [nextSteps]
  );

  function eventPieces() {
    const start = new Date(when);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const title = customerName
      ? `Next visit: ${customerName}`
      : `Next visit: ${jobTitle}`;
    const lines = [reason];
    if (todo.trim()) lines.push(`To do: ${todo.trim()}`);
    if (bringList) lines.push(`Bring: ${bringList}`);
    if (noteId)
      lines.push(`Previous visit in TekScribe: ${window.location.origin}/notes/${noteId}`);
    return { start, end, title, description: lines.join("\n") };
  }

  async function saveToDigest(start: Date) {
    try {
      await scheduleVisit({
        noteId,
        customerName,
        reason,
        todo: todo.trim(),
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
    const { start, end, title, description } = eventPieces();
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: `${calStamp(start)}/${calStamp(end)}`,
      details: description,
    });
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
    const { start, end, title, description } = eventPieces();
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
        {customerName ? (
          <p className="mt-1 text-sm text-muted">👤 {customerName}</p>
        ) : null}
        <p className="mt-0.5 text-sm text-muted">{reason}</p>

        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
            What the next visit is for
          </label>
          <textarea
            value={todo}
            onChange={(e) => setTodo(e.target.value)}
            rows={2}
            placeholder="e.g. Install the new shutoff valve and check the upstairs sink"
            className="w-full rounded-lg border border-border bg-surface p-3 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {bringList && (
            <p className="mt-1 text-xs text-muted">
              Bring: {bringList} (goes in the event notes)
            </p>
          )}
        </div>

        <div className="mt-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
            When
          </label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
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
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
