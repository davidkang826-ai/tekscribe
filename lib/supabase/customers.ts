"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Save (or update) a customer in the tech's directory so it recalls later.
 * Customers are keyed by name AND email, so the same name can appear more than
 * once with different emails (e.g. two different "John Smith"s). When an email
 * is given we match on name+email; without an email we fall back to name only.
 */
export async function upsertCustomer(input: {
  name: string;
  email?: string;
  phone?: string;
}): Promise<void> {
  const name = input.name?.trim();
  if (!name) return;
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  let query = supabase
    .from("customers")
    .select("id, email, phone")
    .eq("user_id", user.id)
    .ilike("name", name);
  // Match the exact person when we have an email to key on.
  query = email ? query.ilike("email", email) : query.limit(1);
  const { data: existing } = await query;
  const dupe = existing?.[0];

  if (dupe) {
    // Fill in any new details without wiping what's already saved.
    const patch: Record<string, string> = {};
    if (email && !dupe.email) patch.email = email;
    if (phone && !dupe.phone) patch.phone = phone;
    if (Object.keys(patch).length) {
      await supabase
        .from("customers")
        .update(patch)
        .eq("id", dupe.id)
        .eq("user_id", user.id);
    }
  } else {
    await supabase
      .from("customers")
      .insert({ user_id: user.id, name, email, phone });
  }
}
