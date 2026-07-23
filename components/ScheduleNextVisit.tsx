"use client";

import { useMemo, useState } from "react";
import { scheduleVisit } from "@/lib/supabase/visits";
import { TIME_OPTIONS, dateInputValue, combineDateTime } from "@/lib/times";
import AddressInput from "./AddressInput";
import EventVoiceEdit from "./EventVoiceEdit";
import { openGoogleCalendar, openAppleCalendar } from "@/lib/calendar-links";

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

/**
 * Step 4: put the next visit on the calendar. Creates a Google Calendar or
 * Apple Calendar (.ics) event, remembers which one the tech prefers, and
 * saves the visit so the Daily Digest can list it. Entirely skippable.
 */
export default function ScheduleNextVisit({
  customerName: customerNameProp,
  jobTitle,
  nextSteps,
  noteId,
  customerAddress = "",
  customerPhone = "",
  customerRequests = [],
  onDone,
}: {
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  jobTitle: string;
  nextSteps: string[];
  customerRequests?: string[];
  noteId: string | null;
  onDone: () => void;
}) {
  // A state so the voice control can correct it ("actually this is for Bob").
  const [customerName, setCustomerName] = useState(customerNameProp);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("08:00");
  const [busy, setBusy] = useState(false);
  const [pref, setPref] = useState<CalPref | null>(readPref);
  // On-site visit, or just a reminder to call the customer.
  const [kind, setKind] = useState<"visit" | "call">("visit");
  // Prefill the address with what the tech entered on the note.
  const [address, setAddress] = useState(customerAddress);
  // For a call reminder: the number to call, prefilled from the note.
  const [phone, setPhone] = useState(customerPhone);

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
    if (kind === "call" && phone.trim()) lines.push(`Call: ${phone.trim()}`);
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
        phone: kind === "call" ? phone.trim() : "",
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
    const pieces = eventPieces();
    openGoogleCalendar(pieces);
    await saveToDigest(pieces.start);
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
    const pieces = eventPieces();
    openAppleCalendar(
      pieces,
      `${noteId || "visit"}-${pieces.start.getTime()}@tekscribe`
    );
    await saveToDigest(pieces.start);
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
      className={`flex-1 rounded-xl px-4 py-3 text-[15px] font-semibold shadow-sm transition disabled:opacity-60 ${
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
      className={`flex-1 rounded-xl px-4 py-3 text-[15px] font-semibold shadow-sm transition disabled:opacity-60 ${
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

        {/* Say the plan and the AI fills the date, time, address, and details;
            or set it by hand below. */}
        <div className="mt-3 rounded-xl bg-brand-50/60 p-3">
          <EventVoiceEdit
            current={{
              customer: customerName,
              kind,
              address,
              phone,
              todo,
              date,
              time,
            }}
            onApply={(f) => {
              setCustomerName(f.customer);
              setKind(f.kind);
              setAddress(f.address);
              setPhone(f.phone);
              setTodo(f.todo);
              setDate(f.date);
              setTime(f.time);
            }}
          />
          <p className="mt-1.5 text-[13px] text-muted">
            Say when and what it&apos;s for, like &quot;next Tuesday at 3, finish
            the upstairs sink.&quot;
          </p>
        </div>

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
              className={`rounded-full px-3.5 py-1.5 text-[15px] font-medium transition ${
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
            <label className="block text-[13px] font-semibold uppercase tracking-wide text-muted mb-1">
              Address
            </label>
            <AddressInput
              value={address}
              onChange={setAddress}
              placeholder="123 Main St, Seattle, WA"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[17px] focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        )}

        {kind === "call" && (
          <div className="mt-3">
            <label className="block text-[13px] font-semibold uppercase tracking-wide text-muted mb-1">
              Number to call
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(617) 555-0123"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[17px] focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <p className="mt-1 text-[13px] text-muted">
              Prefilled from this client. Change it if you need a different
              number.
            </p>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-[13px] font-semibold uppercase tracking-wide text-muted mb-1">
            {kind === "call" ? "What the call is for" : "What this visit is for"}
          </label>
          <textarea
            value={todo}
            onChange={(e) => setTodo(e.target.value)}
            rows={4}
            placeholder="e.g. Install the new shutoff valve and check the upstairs sink"
            className="w-full rounded-lg border border-border bg-surface p-3 text-[17px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {bringList && (
            <p className="mt-2 text-[15px] font-semibold text-success">
              🧰 Bring: {bringList}
            </p>
          )}
        </div>

        {/* Date and time on their own rows so neither gets cramped. */}
        <div className="mt-3">
          <label className="block text-[13px] font-semibold uppercase tracking-wide text-muted mb-1">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[17px] focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div className="mt-3">
          <label className="block text-[13px] font-semibold uppercase tracking-wide text-muted mb-1">
            Time
          </label>
          {/* A native select: iOS renders it as a scroll wheel, like the
              Apple Calendar picker, in 5-minute steps. */}
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[17px] focus:outline-none focus:ring-2 focus:ring-brand/30"
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
            className="text-[13px] font-medium text-muted hover:text-foreground transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
