"use client";

import Link from "next/link";
import { useState } from "react";

export default function PlanCard({
  planName,
  planStatus,
  hasBilling,
  notesUsed,
  notesLimit,
  promoUntil = null,
}: {
  planName: string;
  planStatus: string | null;
  hasBilling: boolean;
  notesUsed: number;
  notesLimit: number | null;
  promoUntil?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url)
        throw new Error(data.error || "Couldn't open billing.");
      window.location.href = data.url as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open billing.");
      setLoading(false);
    }
  }

  // "promo" gets a friendlier line of its own below, so keep it out of here.
  const statusLabel =
    planStatus && planStatus !== "active" && planStatus !== "promo"
      ? ` · ${planStatus}`
      : "";
  const left = notesLimit === null ? null : Math.max(0, notesLimit - notesUsed);
  const pct =
    notesLimit && notesLimit > 0
      ? Math.min(100, Math.round((notesUsed / notesLimit) * 100))
      : 0;
  const atLimit = left === 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">
        Your plan
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-lg font-bold text-foreground">
          {planName}
          {statusLabel && (
            <span className="text-[15px] font-medium text-muted">{statusLabel}</span>
          )}
        </span>
      </div>

      {promoUntil && (
        <p className="mt-1 text-[15px] font-medium text-brand">
          Pilot access until {promoUntil}
        </p>
      )}

      {notesLimit === null ? (
        <p className="mt-1 text-[15px] text-muted">Unlimited notes</p>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-[15px]">
            <span className="text-muted">Notes this month</span>
            <span className="font-medium text-foreground">
              {notesUsed} of {notesLimit}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${
                atLimit ? "bg-accent" : "bg-brand"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {atLimit
              ? "You've used all your notes this month. Resets on the 1st."
              : `${left} left this month. Resets on the 1st.`}
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-3">
        {hasBilling ? (
          <button
            onClick={openPortal}
            disabled={loading}
            className="tt-pop rounded-lg bg-surface px-4 py-2 text-[15px] font-medium text-foreground ring-1 ring-border hover:bg-slate-50 disabled:opacity-60 transition"
          >
            {loading ? "Opening…" : "Manage billing"}
          </button>
        ) : null}
        <Link
          href="/plans"
          className="tt-pop rounded-lg bg-brand px-4 py-2 text-[15px] font-medium text-white shadow-sm hover:bg-brand-600 transition"
        >
          {hasBilling ? "Change plan" : "See plans & upgrade"}
        </Link>
      </div>
    </div>
  );
}
