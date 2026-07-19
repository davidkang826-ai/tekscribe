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
  scheduled_at: string;
};

type LastVisit = {
  noteId: string;
  when: string;
  didSummary: string;
  bring: string[];
};

type Row = Visit & { last?: LastVisit };

/** First `n` items as one short readable sentence-ish line. */
function brief(items: string[] | undefined, n: number): string {
  return (items ?? []).slice(0, n).join(". ");
}

export default function DigestList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const { data: visits, error } = await supabase
        .from("scheduled_visits")
        .select("id, note_id, customer_name, reason, todo, scheduled_at")
        .gte("scheduled_at", dayStart.toISOString())
        .lt("scheduled_at", dayEnd.toISOString())
        .order("scheduled_at", { ascending: true });

      if (cancelled) return;
      if (error) {
        // Most likely the scheduled_visits migration hasn't run yet.
        setNeedsMigration(true);
        setRows([]);
        return;
      }

      // For each visit, the most recent saved note for that customer: what
      // was done last time, and what to buy/bring (from its next steps).
      const withLast = await Promise.all(
        (visits ?? []).map(async (v: Visit): Promise<Row> => {
          if (!v.customer_name) return v;
          const { data: note } = await supabase
            .from("voice_notes")
            .select("id, summary, created_at")
            .eq("customer_name", v.customer_name)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!note) return v;
          const s = (note.summary ?? null) as JobSummary | null;
          return {
            ...v,
            last: {
              noteId: note.id as string,
              when: new Date(note.created_at as string).toLocaleDateString(
                undefined,
                { month: "short", day: "numeric" }
              ),
              didSummary: brief(s?.workDone, 2),
              bring:
                s?.nextSteps
                  ?.filter((x) => /^buy\s*:/i.test(x.trim()))
                  .map((x) => x.replace(/^buy\s*:\s*/i, "")) ?? [],
            },
          };
        })
      );
      if (!cancelled) setRows(withLast);
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
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-muted">
        <p className="font-medium text-foreground">
          Nothing on the books today.
        </p>
        <p className="mt-2 text-sm">
          When you finish a note, the &quot;Schedule next visit&quot; step files
          the visit here automatically.
        </p>
        {needsMigration && (
          <p className="mt-3 text-xs">
            (Just updated? Run the latest supabase/schema.sql in the Supabase
            SQL editor to enable the digest.)
          </p>
        )}
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-3">
      {rows.map((v) => (
        <li
          key={v.id}
          className="tt-elevate rounded-2xl border border-border bg-surface p-5"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold text-foreground">
              {v.customer_name || "No customer"}
            </h3>
            <time className="text-sm font-semibold text-brand whitespace-nowrap">
              {new Date(v.scheduled_at).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </div>
          {v.reason && <p className="mt-0.5 text-xs text-muted">{v.reason}</p>}

          {v.todo && (
            <p className="mt-3 text-[15px] text-foreground">
              <span className="font-medium">To do:</span> {v.todo}
            </p>
          )}

          {v.last?.didSummary && (
            <p className="mt-2 text-sm text-muted">
              <span className="font-medium text-foreground">Last visit</span> (
              {v.last.when}): {v.last.didSummary}
            </p>
          )}

          {v.last && v.last.bring.length > 0 && (
            <p className="mt-2 text-sm text-accent-600">
              <span className="font-medium">Bring / buy:</span>{" "}
              {v.last.bring.join(", ")}
            </p>
          )}

          {(v.note_id || v.last?.noteId) && (
            <Link
              href={`/notes/${v.note_id || v.last?.noteId}`}
              className="mt-3 inline-block text-xs font-medium text-brand hover:underline"
            >
              Previous visit note →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
