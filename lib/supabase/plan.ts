"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  promoMatches,
  promoExpiry,
  PROMO_PLAN,
  PROMO_MONTHS,
} from "@/lib/promo";
import { planById } from "@/lib/plans";

/** Stay on (or move to) the Free plan and leave the plan-selection screen. */
export async function selectFreePlan(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("profiles")
    .update({ plan: "free", plan_selected: true })
    .eq("id", user.id);

  redirect("/");
}

/** Leave the plans screen without changing anything — the escape hatch so
 *  the paywall never traps anyone. Marks the screen as seen and goes home. */
export async function keepCurrentPlan(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("profiles")
    .update({ plan_selected: true })
    .eq("id", user.id);

  redirect("/");
}

export type RedeemResult = {
  error?: string;
  ok?: boolean;
  planName?: string;
  months?: number;
};

/**
 * Redeem the pilot promo code: unlock a paid plan for the trial window with no
 * card and no Stripe. Sets an expiry so the plan lapses back to Free on its
 * own (see resolvePlan) instead of being a permanent giveaway.
 */
export async function redeemPromo(code: string): Promise<RedeemResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  if (!promoMatches(code || "")) {
    return { error: "That code isn't valid. Check it and try again." };
  }

  const planName = planById(PROMO_PLAN)?.name ?? "Pro";
  const expiresIso = promoExpiry().toISOString();

  const { error } = await supabase
    .from("profiles")
    .update({
      plan: PROMO_PLAN,
      plan_status: "promo",
      plan_selected: true,
      plan_expires_at: expiresIso,
    })
    .eq("id", user.id);

  // The plan_expires_at column may not exist yet (migration not run). Grant
  // the plan anyway so the pilot isn't blocked; it just won't auto-expire.
  if (error) {
    const retry = await supabase
      .from("profiles")
      .update({ plan: PROMO_PLAN, plan_status: "promo", plan_selected: true })
      .eq("id", user.id);
    if (retry.error) return { error: retry.error.message };
  }

  return { ok: true, planName, months: PROMO_MONTHS };
}
