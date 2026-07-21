"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import DeleteNoteButton from "./DeleteNoteButton";
import { GoogleDriveLogo } from "./GoogleDriveLogo";
import type { JobSummary } from "@/lib/types";

export type ArchiveNote = {
  id: string;
  job_title: string | null;
  customer_name: string | null;
  transcript: string;
  summary: JobSummary | null;
  customer_email: string | null;
  created_at: string;
  drive_folder_id?: string | null;
  drive_synced_at?: string | null;
};

type SortKey = "recent" | "name" | "next";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Date of visit" },
  { key: "name", label: "Client name A–Z" },
  { key: "next", label: "Next visit" },
];

type Group = {
  name: string | null;
  notes: ArchiveNote[];
  nextVisit?: string; // ISO date of the customer's next scheduled visit
};

export default function ArchiveList({
  rows,
  nextVisits,
}: {
  rows: ArchiveNote[];
  /** customer name → ISO timestamp of their next upcoming scheduled visit */
  nextVisits: Record<string, string>;
}) {
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // Group by customer, preserving recency order of first appearance (rows
  // arrive newest-first from the server).
  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];
    const indexByKey = new Map<string, number>();
    for (const note of rows) {
      const name = note.customer_name?.trim() || null;
      const key = name ?? " ";
      if (!indexByKey.has(key)) {
        indexByKey.set(key, out.length);
        out.push({
          name,
          notes: [],
          nextVisit: name ? nextVisits[name] : undefined,
        });
      }
      out[indexByKey.get(key)!].notes.push(note);
    }
    return out;
  }, [rows, nextVisits]);

  const allNames = useMemo(
    () =>
      groups
        .map((g) => g.name)
        .filter((n): n is string => !!n)
        .sort((a, b) => a.localeCompare(b)),
    [groups]
  );

  const q = query.trim().toLowerCase();

  // Typeahead: names matching what's typed so far, unless it's already an
  // exact pick.
  const suggestions =
    q && !allNames.some((n) => n.toLowerCase() === q)
      ? allNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 6)
      : [];

  // Cheap enough to compute per render for any realistic archive size.
  let visible = groups;
  if (q) {
    visible = visible.filter((g) => g.name?.toLowerCase().includes(q));
  }
  if (sort === "name") {
    visible = [...visible].sort((a, b) =>
      (a.name ?? "￿").localeCompare(b.name ?? "￿")
    );
  } else if (sort === "next") {
    // Customers with an upcoming visit first, soonest first; the rest keep
    // their recency order after that.
    visible = [...visible].sort((a, b) => {
      if (a.nextVisit && b.nextVisit)
        return a.nextVisit.localeCompare(b.nextVisit);
      if (a.nextVisit) return -1;
      if (b.nextVisit) return 1;
      return 0;
    });
  }

  const hasCustomers = groups.some((g) => g.name);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-muted">
        No saved jobs yet. Record a note and tap{" "}
        <span className="font-medium text-foreground">Save</span>.
      </div>
    );
  }

  return (
    <div>
      {/* Search-as-you-type over client names */}
      <div className="relative mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          placeholder="Search clients…"
          className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        {searchFocused && suggestions.length > 0 && (
          <ul className="tt-elevate absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface">
            {suggestions.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setQuery(n)}
                  className="block w-full px-4 py-2.5 text-left text-[15px] text-foreground hover:bg-brand-50 transition"
                >
                  👤 {n}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sort chips */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSort(s.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
              sort === s.key
                ? "bg-brand text-white ring-brand"
                : "bg-surface text-muted ring-border hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-muted">
          No clients match &quot;{query}&quot;.
        </div>
      ) : (
        <div className="space-y-8">
          {visible.map((group, gi) => (
            <div key={group.name ?? `no-customer-${gi}`}>
              {hasCustomers && (
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="truncate">{group.name ?? "No customer"}</span>
                  {group.nextVisit && (
                    <Link
                      href="/calendar"
                      className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand hover:bg-brand/10 transition"
                    >
                      Next{" "}
                      {new Date(group.nextVisit).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </Link>
                  )}
                  {(() => {
                    const folder = group.notes.find(
                      (n) => n.drive_folder_id
                    )?.drive_folder_id;
                    return folder ? (
                      <a
                        href={`https://drive.google.com/drive/folders/${folder}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open in Google Drive"
                        className="ml-auto shrink-0"
                      >
                        <GoogleDriveLogo size={15} />
                      </a>
                    ) : null;
                  })()}
                </h2>
              )}
              <ul className="space-y-3">
                {group.notes.map((note) => (
                  <NoteCard key={note.id} note={note} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Every card is the same compact size; tapping it expands the details. */
function NoteCard({ note }: { note: ArchiveNote }) {
  const [open, setOpen] = useState(false);
  const preview =
    note.summary?.workDone?.[0] || note.transcript.replace(/\s+/g, " ");

  return (
    <li className="relative">
      {/* A div with button semantics: the expanded state nests a real link,
          which HTML forbids inside an actual <button>. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-expanded={open}
        className="tt-elevate tt-elevate-hover block w-full rounded-2xl border border-border bg-surface p-5 pr-12 text-left hover:border-brand/40 transition"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold text-foreground truncate">
            {note.job_title || "Service visit"}
          </h3>
          <time className="text-xs text-muted whitespace-nowrap">
            {new Date(note.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>

        {!open ? (
          <p className="mt-2 text-[15px] text-muted line-clamp-1">{preview}</p>
        ) : (
          <div className="tt-fade-in">
            {note.summary?.workDone?.length ? (
              <ul className="mt-2 space-y-1">
                {note.summary.workDone.map((item, i) => (
                  <li key={i} className="flex gap-2 text-[15px] text-foreground">
                    <span className="text-brand">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[15px] text-muted">{note.transcript}</p>
            )}

            {(note.customer_email || note.drive_synced_at) && (
              <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                {note.customer_email && (
                  <span>Sent to {note.customer_email}</span>
                )}
                {note.drive_synced_at && (
                  <span className="text-success">✓ Backed up to Drive</span>
                )}
              </p>
            )}

            <Link
              href={`/notes/${note.id}`}
              onClick={(e) => e.stopPropagation()}
              className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
            >
              Open full note
            </Link>
          </div>
        )}
      </div>
      <DeleteNoteButton id={note.id} />
    </li>
  );
}
