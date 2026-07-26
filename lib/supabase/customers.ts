"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ContactResult = { error?: string; id?: string };

/** A contact needs a name plus at least one way to reach them. */
function validateContact(input: {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}): string | null {
  if (!input.name?.trim()) return "Please enter at least a first name.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))
    return "That email doesn't look right.";
  if (
    !input.email?.trim() &&
    !input.phone?.trim() &&
    !input.address?.trim()
  )
    return "Add an email, phone, or address so you can reach them.";
  return null;
}

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

/** Add a contact by hand from the Contacts tab. Name is required plus one way
 *  to reach them; other fields are optional. */
export async function createContact(input: {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}): Promise<ContactResult> {
  const bad = validateContact(input);
  if (bad) return { error: bad };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in." };

  const row = {
    user_id: user.id,
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
  };
  let ins = await supabase.from("customers").insert(row).select("id").single();
  // Older databases may not have the address column yet.
  if (ins.error && isMissingAddressColumn(ins.error)) {
    const { address: _address, ...rest } = row;
    void _address;
    ins = await supabase.from("customers").insert(rest).select("id").single();
  }
  if (ins.error) {
    if (ins.error.code === "23505")
      return { error: "You already have a contact with that name and email." };
    return { error: ins.error.message };
  }
  revalidatePath("/contacts");
  return { id: ins.data?.id as string };
}

/** Edit an existing contact in place. */
export async function updateContact(
  id: string,
  input: { name: string; email?: string; phone?: string; address?: string }
): Promise<ContactResult> {
  if (!id) return { error: "Missing contact." };
  const bad = validateContact(input);
  if (bad) return { error: bad };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in." };

  const patch = {
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
  };
  let upd = await supabase
    .from("customers")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);
  if (upd.error && isMissingAddressColumn(upd.error)) {
    const { address: _address, ...rest } = patch;
    void _address;
    upd = await supabase
      .from("customers")
      .update(rest)
      .eq("id", id)
      .eq("user_id", user.id);
  }
  if (upd.error) {
    if (upd.error.code === "23505")
      return { error: "You already have a contact with that name and email." };
    return { error: upd.error.message };
  }
  revalidatePath("/contacts");
  return { id };
}

/** Remove a contact from the directory. */
export async function deleteContact(id: string): Promise<ContactResult> {
  if (!id) return { error: "Missing contact." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in." };

  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/contacts");
  return {};
}

/** One-time bulk import from the phone's address book. Only rows with a name
 *  and at least one contact detail are kept, and names already in the directory
 *  are skipped so re-importing never duplicates. Returns how many were added. */
export async function importContacts(
  rows: { name: string; email?: string; phone?: string; address?: string }[]
): Promise<{ added: number; skipped: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { added: 0, skipped: 0, error: "You need to be signed in." };

  // Keep only usable contacts.
  const clean = rows
    .map((r) => ({
      name: (r.name ?? "").trim(),
      email: (r.email ?? "").trim(),
      phone: (r.phone ?? "").trim(),
      address: (r.address ?? "").trim(),
    }))
    .filter((r) => r.name && (r.email || r.phone || r.address));
  if (!clean.length) return { added: 0, skipped: 0 };

  // Skip names already saved (case-insensitive), so import is idempotent.
  const existing = await supabase
    .from("customers")
    .select("name")
    .eq("user_id", user.id);
  const have = new Set(
    (existing.data ?? []).map((c) => (c.name as string).trim().toLowerCase())
  );

  const toInsert: {
    user_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  }[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of clean) {
    const key = r.name.toLowerCase();
    if (have.has(key) || seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    toInsert.push({
      user_id: user.id,
      name: r.name,
      email: r.email || null,
      phone: r.phone || null,
      address: r.address || null,
    });
  }
  if (!toInsert.length) return { added: 0, skipped };

  let ins = await supabase.from("customers").insert(toInsert);
  if (ins.error && isMissingAddressColumn(ins.error)) {
    ins = await supabase.from("customers").insert(
      toInsert.map((r) => ({
        user_id: r.user_id,
        name: r.name,
        email: r.email,
        phone: r.phone,
      }))
    );
  }
  if (ins.error) return { added: 0, skipped, error: ins.error.message };

  revalidatePath("/contacts");
  return { added: toInsert.length, skipped };
}

/** True when a write failed only because the address column isn't in the table
 *  yet (migration not run), so retrying without it is safe. */
function isMissingAddressColumn(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("address") && msg.includes("column");
}
