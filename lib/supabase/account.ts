"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

/**
 * Permanently delete the signed-in technician's account and everything tied to
 * it: any active subscription is canceled, their stored photos/files are
 * removed, and the auth user is deleted (which cascades their profile,
 * voice_notes, customers, and templates via ON DELETE CASCADE).
 */
export async function deleteAccount(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const userId = user.id;

  // 1. Stop all billing before deleting anything, so they can never be charged
  //    after their account is gone.
  let prof: {
    stripe_subscription_id?: string | null;
    stripe_customer_id?: string | null;
  } | null = null;
  try {
    const res = await supabase
      .from("profiles")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();
    prof = res.data;
  } catch (err) {
    console.error("[deleteAccount] read billing", err);
  }

  if (isStripeConfigured && (prof?.stripe_customer_id || prof?.stripe_subscription_id)) {
    const stripe = getStripe();
    let stopped = false;

    // Deleting the customer cancels every subscription they have and removes
    // their billing record from Stripe in one shot, the most complete way to
    // guarantee no further charges (and cleaner for their data).
    if (prof.stripe_customer_id) {
      try {
        await stripe.customers.del(prof.stripe_customer_id);
        stopped = true;
      } catch (err) {
        console.error("[deleteAccount] delete customer", err);
      }
    }

    // Fallback: if we couldn't delete the customer, at least cancel the known
    // subscription directly.
    if (!stopped && prof.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(prof.stripe_subscription_id);
        stopped = true;
      } catch (err) {
        console.error("[deleteAccount] cancel subscription", err);
      }
    }

    // If they had billing set up and we could not stop it, do NOT delete the
    // account. Better they retry than lose the account while still being
    // charged with no way to manage it. (redirect() is outside any try/catch
    // so it isn't swallowed.)
    if (!stopped) {
      redirect("/settings?deleteError=billing");
    }
  }

  const admin = createAdminClient();

  // 2. Remove their stored photos/files (storage isn't covered by the cascade).
  try {
    const { data: visits } = await admin.storage
      .from("visit-media")
      .list(userId, { limit: 1000 });
    const paths: string[] = [];
    for (const v of visits ?? []) {
      const { data: files } = await admin.storage
        .from("visit-media")
        .list(`${userId}/${v.name}`, { limit: 1000 });
      for (const f of files ?? []) paths.push(`${userId}/${v.name}/${f.name}`);
    }
    if (paths.length) {
      await admin.storage.from("visit-media").remove(paths);
    }
  } catch (err) {
    console.error("[deleteAccount] storage cleanup", err);
  }

  // 3. Delete the auth user. Foreign keys cascade the rest of their data.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[deleteAccount] delete user", error.message);
    // Surface a generic failure by bouncing back to settings.
    redirect("/settings?deleteError=1");
  }

  // 4. Clear the (now-orphaned) session and say goodbye.
  try {
    await supabase.auth.signOut();
  } catch {
    // session is gone anyway
  }
  redirect("/login?deleted=1");
}
