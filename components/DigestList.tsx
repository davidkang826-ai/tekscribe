"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoMark } from "./Logo";
import { createClient } from "@/lib/supabase/client";
import type { JobSummary } from "@/lib/types";

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

const MAP_KEY = "tekscribe.map-pref";
function mapHref(address: string): string {
  const q = encodeURIComponent(address);
  let apple = false;
  try {
    apple = localStorage.getItem(MAP_KEY) === "apple";
  } catch {
    // default Google
  }
  return apple
    ? `https://maps.apple.com/?q=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

type Enriched = Visit & {
  phone?: string | null;
  addr?: string | null;
  lastVisit?: string; // one short line
  todoLine?: string; // what to do + bring, combined
};

/** One tight line from a couple of bullet fragments. */
function oneLine(items: string[] | undefined, max = 2): string {
  return (items ?? [])
    .slice(0, max)
    .map((s) => s.trim().replace(/\.+$/, ""))
    .join("; ");
}

export default function DigestList() {
  const [rows, setRows] = useState<Enriched[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      let visits: Visit[] | null = null;
      const full = await supabase
        .from("scheduled_visits")
        .select("id, note_id, customer_name, reason, todo, kind, address, scheduled_at")
        .gte("scheduled_at", dayStart.toISOString())
        .lt("scheduled_at", dayEnd.toISOString())
        .order("scheduled_at", { ascending: true });
      if (!full.error) {
        visits = (full.data ?? []) as Visit[];
      } else {
        const legacy = await supabase
          .from("scheduled_visits")
          .select("id, note_id, customer_name, reason, todo, scheduled_at")
          .gte("scheduled_at", dayStart.toISOString())
          .lt("scheduled_at", dayEnd.toISOString())
          .order("scheduled_at", { ascending: true });
        if (!legacy.error) visits = (legacy.data ?? []) as Visit[];
      }

      if (cancelled) return;
      if (visits === null) {
        setNeedsMigration(true);
        setRows([]);
        return;
      }

      // Customer directory for phone/address lookups (tolerant of no address).
      const contacts = new Map<
        string,
        { phone: string | null; address: string | null }
      >();
      const cust = await supabase
        .from("customers")
        .select("name, phone, address");
      const custRows = cust.error
        ? (await supabase.from("customers").select("name, phone")).data
        : cust.data;
      for (const c of custRows ?? []) {
        const rec = c as { name: string; phone: string | null; address?: string | null };
        contacts.set(rec.name.trim().toLowerCase(), {
          phone: rec.phone ?? null,
          address: rec.address ?? null,
        });
      }

      const enriched = await Promise.all(
        (visits ?? []).map(async (v: Visit): Promise<Enriched> => {
          const contact = v.customer_name
            ? contacts.get(v.customer_name.trim().toLowerCase())
            : undefined;
          let lastVisit: string | undefined;
          let bring: string[] = [];
          if (v.customer_name) {
            const { data: note } = await supabase
              .from("voice_notes")
              .select("summary")
              .eq("customer_name", v.customer_name)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const s = (note?.summary ?? null) as JobSummary | null;
            lastVisit = oneLine(s?.workDone, 2) || undefined;
            bring =
              s?.nextSteps
                ?.filter((x) => /^buy\s*:/i.test(x.trim()))
                .map((x) => x.replace(/^buy\s*:\s*/i, "")) ?? [];
          }
          // Combine "what to do" and "what to bring" into one line.
          const todoParts: string[] = [];
          if (v.todo?.trim()) todoParts.push(v.todo.trim());
          if (bring.length) todoParts.push(`Bring: ${bring.join(", ")}`);
          return {
            ...v,
            phone: contact?.phone ?? null,
            addr: v.address || contact?.address || null,
            lastVisit,
            todoLine: todoParts.join(" · ") || undefined,
          };
        })
      );
      if (!cancelled) setRows(enriched);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null) {
    return (
      <div className="mt-16 flex justify-center">
        <LogoMark size={48} className="tt-logo-load" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
        <p className="font-medium text-foreground">
          Nothing on the books today.
        </p>
        {needsMigration && (
          <p className="mt-3 text-xs text-muted">
            (Just updated? Run the latest supabase/schema.sql to enable the
            digest.)
          </p>
        )}
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-3">
      {rows.map((v) => {
        const isCall = v.kind === "call";
        return (
          <li
            key={v.id}
            className="tt-elevate rounded-2xl border border-border bg-surface p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-semibold text-foreground truncate">
                  {v.customer_name || "No customer"}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isCall
                      ? "bg-brand-50 text-brand"
                      : "bg-green-100 text-success"
                  }`}
                >
                  {isCall ? "Call" : "Visit"}
                </span>
              </div>
              <time className="shrink-0 text-sm font-semibold text-brand whitespace-nowrap">
                {new Date(v.scheduled_at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </div>

            {/* Direct action: call → phone; visit → address + map */}
            {isCall && v.phone && (
              <a
                href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}
                className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
              >
                📞 {v.phone}
              </a>
            )}
            {!isCall && v.addr && (
              <a
                href={mapHref(v.addr)}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
              >
                📍 {v.addr}
              </a>
            )}

            {v.lastVisit && (
              <p className="mt-2 text-sm text-muted">
                <span className="font-medium text-foreground">Last time:</span>{" "}
                {v.lastVisit}
              </p>
            )}
            {v.todoLine && (
              <p className="mt-1 text-sm text-foreground">
                <span className="font-medium">This time:</span> {v.todoLine}
              </p>
            )}

            {v.note_id && (
              <Link
                href={`/notes/${v.note_id}`}
                className="mt-2 inline-block text-xs font-medium text-brand hover:underline"
              >
                Previous visit note
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
