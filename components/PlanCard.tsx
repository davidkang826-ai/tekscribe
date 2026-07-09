"use client";

import Link from "next/link";
import { useState } from "react";

export default function PlanCard({
  planName,
  planStatus,
  hasBilling,
}: {
  planName: string;
  planStatus: string | null;
  hasBilling: boolean;
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

  const statusLabel =
    planStatus && planStatus !== "active" ? ` · ${planStatus}` : "";

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
        Your plan
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-lg font-bold text-foreground">
          {planName}
          {statusLabel && (
            <span className="text-sm font-medium text-muted">{statusLabel}</span>
          )}
        </span>
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-3">
        {hasBilling ? (
          <button
            onClick={openPortal}
            disabled={loading}
            className="tt-pop rounded-lg bg-surface px-4 py-2 text-sm font-medium text-foreground ring-1 ring-border hover:bg-slate-50 disabled:opacity-60 transition"
          >
            {loading ? "Opening…" : "Manage billing"}
          </button>
        ) : null}
        <Link
          href="/plans"
          className="tt-pop rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 transition"
        >
          {hasBilling ? "Change plan" : "See plans & upgrade"}
        </Link>
      </div>
    </div>
  );
}
