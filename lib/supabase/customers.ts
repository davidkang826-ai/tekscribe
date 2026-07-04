"use server";

import { createClient } from "@/lib/supabase/server";

/** Save (or update) a customer in the tech's directory so it recalls later. */
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

  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .ilike("name", name)
    .limit(1);
  const dupe = existing?.[0];

  if (dupe) {
    // Fill in any new details without wiping what's already saved.
    const patch: Record<string, string> = {};
    if (email) patch.email = email;
    if (phone) patch.phone = phone;
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
