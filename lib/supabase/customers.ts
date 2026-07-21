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
  address?: string;
}): Promise<void> {
  const name = input.name?.trim();
  if (!name) return;
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;
  const address = input.address?.trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // address may not exist on databases where the migration hasn't run; select
  // it in a tolerant way so a missing column can't break saving.
  let query = supabase
    .from("customers")
    .select("id, email, phone, address")
    .eq("user_id", user.id)
    .ilike("name", name);
  // Match the exact person when we have an email to key on.
  query = email ? query.ilike("email", email) : query.limit(1);
  const res = await query;
  const dupe = res.data?.[0] as
    | { id: string; email: string | null; phone: string | null; address?: string | null }
    | undefined;

  if (dupe) {
    // Fill in any new details without wiping what's already saved. Newer
    // detail replaces an empty field; a changed address updates in place.
    const patch: Record<string, string> = {};
    if (email && !dupe.email) patch.email = email;
    if (phone && !dupe.phone) patch.phone = phone;
    if (address && address !== (dupe.address ?? "")) patch.address = address;
    if (Object.keys(patch).length) {
      const upd = await supabase
        .from("customers")
        .update(patch)
        .eq("id", dupe.id)
        .eq("user_id", user.id);
      // Retry without address on databases missing that column.
      if (upd.error && "address" in patch) {
        const rest = { ...patch };
        delete rest.address;
        if (Object.keys(rest).length)
          await supabase
            .from("customers")
            .update(rest)
            .eq("id", dupe.id)
            .eq("user_id", user.id);
      }
    }
  } else {
    const ins = await supabase
      .from("customers")
      .insert({ user_id: user.id, name, email, phone, address });
    if (ins.error)
      await supabase
        .from("customers")
        .insert({ user_id: user.id, name, email, phone });
  }
}
