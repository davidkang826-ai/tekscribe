"use client";

import { useState } from "react";
import type { PlanDisplay, Billing } from "@/lib/plans";
import { selectFreePlan, keepCurrentPlan } from "@/lib/supabase/plan";

export default function PlanChooser({
  tiers,
  currentPlan,
  stripeReady,
}: {
  tiers: PlanDisplay[];
  currentPlan: string;
  stripeReady: boolean;
}) {
  const [billing, setBilling] = useState<Billing>("yearly");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(planId: string) {
    setLoading(planId);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, billing }),
      });
      const data = await res.json();
      if (!res.ok || !data.url)
        throw new Error(data.error || "Couldn't start checkout.");
      window.location.href = data.url as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start checkout.");
      setLoading(null);
    }
  }

  return (
    <div>
      {/* Monthly / yearly toggle */}
      <div className="mb-6 flex justify-center">
        <div className="inline-flex rounded-full bg-slate-100 p-1">
          {(["monthly", "yearly"] as Billing[]).map((b) => (
            <button
              key={b}
              onClick={() => setBilling(b)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                billing === b
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {b === "monthly" ? "Monthly" : "Yearly"}
              {b === "yearly" && (
                <span className="ml-1.5 text-xs font-semibold text-success">
                  save ~17%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-danger ring-1 ring-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {tiers.map((t) => {
          const isCurrent = currentPlan === t.id;
          const price = billing === "yearly" ? t.priceYearly : t.priceMonthly;
          const buyable =
            billing === "yearly" ? t.buyableYearly : t.buyableMonthly;

          return (
            <div
              key={t.id}
              className={`relative flex flex-col rounded-2xl border bg-surface p-5 ${
                t.highlighted
                  ? "border-2 border-brand shadow-md"
                  : "border-border tt-elevate"
              }`}
            >
              {t.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}

              <h3 className="text-lg font-bold text-foreground">{t.name}</h3>
              <p className="text-xs text-muted">{t.tagline}</p>

              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">
                  ${price}
                </span>
                {t.id !== "free" && (
                  <span className="text-sm text-muted">/mo</span>
                )}
              </div>
              <p className="h-4 text-[11px] text-muted">
                {t.id !== "free" && billing === "yearly"
                  ? `$${t.priceYearly * 12} billed yearly`
                  : t.id !== "free"
                    ? "billed monthly"
                    : "free forever"}
              </p>

              <ul className="mt-4 flex-1 space-y-2">
                {t.features.map((f, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-[13px] text-foreground"
                  >
                    <span className="text-brand">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <div className="rounded-lg bg-brand-50 p-2.5 text-center ring-1 ring-brand/20">
                    <div className="text-sm font-semibold text-brand">
                      ✓ You&apos;re on the {t.name} plan
                    </div>
                    <form action={keepCurrentPlan}>
                      <button
                        type="submit"
                        className="mt-1 text-xs font-medium text-brand hover:underline"
                      >
                        Stick with my plan →
                      </button>
                    </form>
                  </div>
                ) : t.id === "free" ? (
                  <form action={selectFreePlan}>
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-surface px-4 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-slate-50 transition"
                    >
                      Choose Free
                    </button>
                  </form>
                ) : !stripeReady || !buyable ? (
                  <div className="rounded-lg bg-slate-100 py-2.5 text-center text-sm font-medium text-muted">
                    Coming soon
                  </div>
                ) : (
                  <button
                    onClick={() => checkout(t.id)}
                    disabled={loading !== null}
                    className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-60 ${
                      t.highlighted
                        ? "bg-brand text-white hover:bg-brand-600"
                        : "bg-foreground text-white hover:opacity-90"
                    }`}
                  >
                    {loading === t.id ? "Starting…" : `Choose ${t.name}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Change or cancel anytime. Prices in USD.
      </p>
    </div>
  );
}
