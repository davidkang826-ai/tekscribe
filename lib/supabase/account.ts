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

  // 1. Cancel any active subscription so they stop being billed (best effort).
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("stripe_subscription_id")
      .eq("id", userId)
      .maybeSingle();
    if (isStripeConfigured && prof?.stripe_subscription_id) {
      await getStripe().subscriptions.cancel(prof.stripe_subscription_id);
    }
  } catch (err) {
    console.error("[deleteAccount] cancel subscription", err);
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
