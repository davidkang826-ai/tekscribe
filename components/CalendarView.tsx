"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LogoMark } from "./Logo";
import { createClient } from "@/lib/supabase/client";
import {
  scheduleVisit,
  updateVisit,
  deleteVisit,
  getCalendarToken,
} from "@/lib/supabase/visits";
import { TIME_OPTIONS, dateInputValue, combineDateTime } from "@/lib/times";
import VoiceToNote from "./VoiceToNote";
import { contactsAvailable, pickContact } from "@/lib/contacts";

type Visit = {
  id: string;
  note_id: string | null;
  customer_name: string | null;
  reason: string | null;
  todo: string | null;
  kind?: string | null;
  address?: string | null;
  scheduled_at: string;
};

type Contact = { name: string; email: string | null; phone: string | null };

const MAP_KEY = "tekscribe.map-pref";
function mapHref(address: string): string {
  const q = encodeURIComponent(address);
  let apple = false;
  try {
    apple = localStorage.getItem(MAP_KEY) === "apple";
  } catch {
    // default to Google
  }
  return apple
    ? `https://maps.apple.com/?q=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function ymd(d: Date): string {
  return dateInputValue(d);
}

/** The 42 cells (6 weeks) that display a month, starting on Sunday. */
function monthCells(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

type FormState = {
  id: string | null; // null = creating
  customer: string;
  kind: "visit" | "call";
  address: string;
  todo: string;
  date: string;
  time: string;
};

export default function CalendarView() {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selected, setSelected] = useState<Date>(today);
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [canUseContacts, setCanUseContacts] = useState(false);
  useEffect(() => setCanUseContacts(contactsAvailable()), []);

  async function fillFormFromContacts() {
    const c = await pickContact();
    if (!c || !form) return;
    setForm({
      ...form,
      customer: c.name || form.customer,
      address: c.address || form.address,
    });
  }

  async function openSync() {
    setSyncOpen(true);
    if (feedUrl || syncBusy) return;
    setSyncBusy(true);
    const { token } = await getCalendarToken();
    if (token) setFeedUrl(`${window.location.origin}/api/calendar/${token}`);
    setSyncBusy(false);
  }

  const loadMonth = useCallback(async () => {
    const supabase = createClient();
    // The whole 6-week grid, so neighboring-month days show their dots too.
    const cells = monthCells(month);
    const from = new Date(cells[0]);
    from.setHours(0, 0, 0, 0);
    const to = new Date(cells[41]);
    to.setHours(24, 0, 0, 0);

    let rows: Visit[] | null = null;
    const full = await supabase
      .from("scheduled_visits")
      .select("id, note_id, customer_name, reason, todo, kind, address, scheduled_at")
      .gte("scheduled_at", from.toISOString())
      .lt("scheduled_at", to.toISOString())
      .order("scheduled_at", { ascending: true });
    if (!full.error) {
      rows = (full.data ?? []) as Visit[];
    } else {
      const legacy = await supabase
        .from("scheduled_visits")
        .select("id, note_id, customer_name, reason, todo, scheduled_at")
        .gte("scheduled_at", from.toISOString())
        .lt("scheduled_at", to.toISOString())
        .order("scheduled_at", { ascending: true });
      rows = legacy.error ? [] : ((legacy.data ?? []) as Visit[]);
    }
    setVisits(rows);
  }, [month]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("customers")
        .select("name, email, phone")
        .order("name", { ascending: true });
      setContacts((data ?? []) as Contact[]);
    })();
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const v of visits ?? []) {
      const key = ymd(new Date(v.scheduled_at));
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    return map;
  }, [visits]);

  const dayVisits = byDay.get(ymd(selected)) ?? [];

  function contactFor(name: string | null): Contact | undefined {
    if (!name) return undefined;
    return contacts.find(
      (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
  }

  function openCreate() {
    setError(null);
    setForm({
      id: null,
      customer: "",
      kind: "visit",
      address: "",
      todo: "",
      date: ymd(selected),
      time: "08:00",
    });
  }

  function openEdit(v: Visit) {
    setError(null);
    const when = new Date(v.scheduled_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    // Snap to the nearest 5 minutes so the value exists in the picker.
    const mins = Math.round(when.getMinutes() / 5) * 5;
    setForm({
      id: v.id,
      customer: v.customer_name ?? "",
      kind: v.kind === "call" ? "call" : "visit",
      address: v.address ?? "",
      todo: v.todo ?? "",
      date: ymd(when),
      time: `${pad(when.getHours())}:${pad(mins % 60)}`,
    });
  }

  async function saveForm() {
    if (!form) return;
    setSaving(true);
    setError(null);
    const when = combineDateTime(form.date, form.time);
    const shared = {
      customerName: form.customer,
      todo: form.todo,
      kind: form.kind,
      address: form.kind === "visit" ? form.address : "",
      scheduledAtIso: when.toISOString(),
    };
    const result = form.id
      ? await updateVisit({ id: form.id, ...shared })
      : await scheduleVisit(shared);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setForm(null);
    setSelected(when);
    setMonth(new Date(when.getFullYear(), when.getMonth(), 1));
    loadMonth();
  }

  async function remove(id: string) {
    setError(null);
    const result = await deleteVisit(id);
    if (result.error) setError(result.error);
    loadMonth();
  }

  const monthLabel = month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      {/* Sync this calendar into the tech's Apple/Google calendar */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => (syncOpen ? setSyncOpen(false) : openSync())}
          className="tt-pop inline-flex items-center gap-1.5 rounded-lg bg-surface px-3.5 py-2 text-sm font-medium text-brand ring-1 ring-border hover:bg-brand-50 transition"
        >
          🔄 Sync to my calendar
        </button>
        {syncOpen && (
          <div className="tt-fade-in mt-2 rounded-2xl border border-border bg-surface p-4 text-sm shadow-sm">
            {syncBusy || !feedUrl ? (
              <p className="text-muted">Preparing your calendar link…</p>
            ) : (
              <>
                <p className="text-muted">
                  Add this once and every TekScribe visit shows up in your
                  calendar and stays updated.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {/* Apple / i-devices: webcal opens the subscribe sheet. */}
                  <a
                    href={feedUrl.replace(/^https?:/, "webcal:")}
                    className="rounded-lg bg-brand px-4 py-2.5 text-center font-semibold text-white shadow-sm hover:bg-brand-600 transition"
                  >
                    Add to Apple Calendar
                  </a>
                  {/* Google: subscribe by URL. */}
                  <a
                    href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(
                      feedUrl
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-surface px-4 py-2.5 text-center font-semibold text-foreground ring-1 ring-border hover:bg-slate-50 transition"
                  >
                    Add to Google Calendar
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(feedUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        // ignore
                      }
                    }}
                    className="text-xs font-medium text-muted hover:text-foreground"
                  >
                    {copied ? "✓ Link copied" : "Or copy the calendar link"}
                  </button>
                </div>
                <p className="mt-3 text-xs text-muted">
                  This is a one-way feed: events flow from TekScribe into your
                  calendar. Keep the link private.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Month header */}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
          aria-label="Previous month"
          className="tt-pop rounded-lg px-3 py-1.5 text-lg text-muted ring-1 ring-border hover:text-foreground"
        >
          ‹
        </button>
        <div className="text-base font-semibold text-foreground">
          {monthLabel}
        </div>
        <button
          type="button"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
          aria-label="Next month"
          className="tt-pop rounded-lg px-3 py-1.5 text-lg text-muted ring-1 ring-border hover:text-foreground"
        >
          ›
        </button>
      </div>

      {/* Grid */}
      <div className="mt-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthCells(month).map((d) => {
            const inMonth = d.getMonth() === month.getMonth();
            const isToday = ymd(d) === ymd(today);
            const isSelected = ymd(d) === ymd(selected);
            const count = byDay.get(ymd(d))?.length ?? 0;
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => setSelected(new Date(d))}
                className={`relative mx-auto my-0.5 flex h-11 w-11 flex-col items-center justify-center rounded-full text-[15px] transition ${
                  isSelected
                    ? "bg-brand text-white font-semibold"
                    : isToday
                      ? "text-brand font-semibold"
                      : inMonth
                        ? "text-foreground hover:bg-slate-100"
                        : "text-muted/50 hover:bg-slate-50"
                }`}
              >
                {d.getDate()}
                {count > 0 && (
                  <span
                    className={`absolute bottom-1.5 h-1 w-1 rounded-full ${
                      isSelected ? "bg-white" : "bg-brand"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day */}
      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {selected.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </h2>
        <button
          type="button"
          onClick={openCreate}
          className="tt-pop rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition"
        >
          ＋ New event
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-danger ring-1 ring-red-100">
          {error}
        </div>
      )}

      {visits === null ? (
        <div className="mt-10 flex justify-center">
          <LogoMark size={40} className="tt-logo-load" />
        </div>
      ) : dayVisits.length === 0 && !form ? (
        <div className="mt-3 rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
          Nothing scheduled this day.
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {dayVisits.map((v) => {
            const contact = contactFor(v.customer_name);
            return (
              <li
                key={v.id}
                className="tt-elevate rounded-2xl border border-border bg-surface p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-foreground">
                    {v.kind === "call" ? "📞 " : ""}
                    {v.customer_name || "No customer"}
                  </h3>
                  <time className="text-sm font-semibold text-brand whitespace-nowrap">
                    {new Date(v.scheduled_at).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                {v.reason && (
                  <p className="mt-0.5 text-xs text-muted">{v.reason}</p>
                )}
                {v.todo && (
                  <p className="mt-2 text-sm text-foreground">{v.todo}</p>
                )}
                {v.address && (
                  <p className="mt-1.5 text-sm text-muted">📍 {v.address}</p>
                )}

                {/* Everything a tech needs mid-day: call, email, map, edit */}
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                  {contact?.phone && (
                    <a
                      href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                      className="rounded-full bg-brand-50 px-3 py-1.5 text-brand hover:bg-brand/10 transition"
                    >
                      📞 Call
                    </a>
                  )}
                  {contact?.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="rounded-full bg-brand-50 px-3 py-1.5 text-brand hover:bg-brand/10 transition"
                    >
                      ✉️ Email
                    </a>
                  )}
                  {v.address && (
                    <a
                      href={mapHref(v.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-brand-50 px-3 py-1.5 text-brand hover:bg-brand/10 transition"
                    >
                      🗺 Map
                    </a>
                  )}
                  {v.note_id && (
                    <Link
                      href={`/notes/${v.note_id}`}
                      className="rounded-full bg-slate-100 px-3 py-1.5 text-foreground hover:bg-slate-200 transition"
                    >
                      Visit note
                    </Link>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => openEdit(v)}
                    className="rounded-full px-3 py-1.5 text-muted ring-1 ring-border hover:text-foreground transition"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(v.id)}
                    className="rounded-full px-3 py-1.5 text-danger ring-1 ring-border hover:bg-red-50 transition"
                  >
                    Delete
                  </button>
                </div>

                {confirmDelete === v.id && (
                  <div className="tt-fade-in mt-3 rounded-xl bg-red-50 p-3 ring-1 ring-red-100">
                    <p className="text-sm font-medium text-foreground">
                      Delete this event?
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDelete(null);
                          remove(v.id);
                        }}
                        className="rounded-lg bg-danger px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition"
                      >
                        Yes, delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-muted ring-1 ring-border hover:text-foreground transition"
                      >
                        Keep it
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Create / edit */}
      {form && (
        <div className="mt-4 rounded-2xl border border-brand/30 bg-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">
            {form.id ? "Edit event" : "New event"}
          </h3>

          <div className="mt-3 space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                  Customer
                </label>
                {canUseContacts && (
                  <button
                    type="button"
                    onClick={fillFormFromContacts}
                    className="tt-pop rounded-full bg-surface px-3 py-1 text-xs font-medium text-brand ring-1 ring-border hover:bg-brand-50 transition"
                  >
                    📇 From Contacts
                  </button>
                )}
              </div>
              <input
                type="text"
                list="tt-cal-customers"
                value={form.customer}
                onChange={(e) => setForm({ ...form, customer: e.target.value })}
                placeholder="Customer name"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <datalist id="tt-cal-customers">
                {contacts.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </div>

            <div className="inline-flex rounded-full bg-slate-100 p-1">
              {(
                [
                  ["visit", "🔧 On-site visit"],
                  ["call", "📞 Reminder to call"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm({ ...form, kind: k })}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    form.kind === k
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {form.kind === "visit" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                  placeholder="123 Main St, Seattle, WA"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                Notes
              </label>
              <textarea
                value={form.todo}
                onChange={(e) => setForm({ ...form, todo: e.target.value })}
                rows={2}
                placeholder="What this visit or call is for"
                className="w-full rounded-lg border border-border bg-surface p-3 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              {/* Talk it through instead of typing; the AI tightens it up and
                  appends it to whatever's already in the notes. */}
              <div className="mt-2">
                <VoiceToNote
                  onResult={(note) =>
                    setForm((f) =>
                      f
                        ? { ...f, todo: f.todo ? `${f.todo.trim()} ${note}` : note }
                        : f
                    )
                  }
                />
              </div>
            </div>

            {/* Date and time on their own rows so neither gets cramped. */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                Time
              </label>
              <select
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={saveForm}
                disabled={saving}
                className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
              >
                {saving ? "Saving…" : form.id ? "Save changes" : "Add to calendar"}
              </button>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted ring-1 ring-border hover:text-foreground transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
