import type { PlanId } from "@/lib/plans";

export type PlanFields = {
  plan?: string | null;
  plan_status?: string | null;
  plan_expires_at?: string | null;
};

/**
 * The plan a tech effectively has right now. A promo or trial that has passed
 * its expiry falls back to Free, so we never need a nightly job to flip the
 * row. Paid Stripe plans carry no expiry and pass straight through.
 */
export function resolvePlan(p: PlanFields | null | undefined): PlanId {
  const plan = ((p?.plan as PlanId) || "free") as PlanId;
  if (plan === "free") return "free";

  // Only promo/trial grants carry an expiry; a paid plan never lapses here, so
  // a stale expiry left over from a promo can't downgrade someone who paid.
  if (p?.plan_status === "promo" && p?.plan_expires_at) {
    const expires = new Date(p.plan_expires_at);
    if (!isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
      return "free";
    }
  }
  return plan;
}

/** A human date for "pilot access until …", or null when there's no expiry. */
export function planExpiryLabel(p: PlanFields | null | undefined): string | null {
  const raw = p?.plan_expires_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
