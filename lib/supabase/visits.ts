"use server";

import { createClient } from "@/lib/supabase/server";

/** Save a scheduled next visit so the Daily Digest can list it. Best-effort:
 *  the calendar event the tech just created is the source of truth, so a
 *  missing table (migration not run) reports an error but breaks nothing. */
export async function scheduleVisit(input: {
  noteId?: string | null;
  customerName?: string;
  reason?: string;
  todo?: string;
  kind?: "visit" | "call";
  address?: string;
  scheduledAtIso: string;
}): Promise<{ error?: string }> {
  const scheduledAt = new Date(input.scheduledAtIso);
  if (isNaN(scheduledAt.getTime())) return { error: "Bad date." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const row = {
    user_id: user.id,
    note_id: input.noteId || null,
    customer_name: input.customerName?.trim() || null,
    reason: input.reason?.trim() || null,
    todo: input.todo?.trim() || null,
    kind: input.kind === "call" ? "call" : "visit",
    address: input.address?.trim() || null,
    scheduled_at: scheduledAt.toISOString(),
  };
  const { error } = await supabase.from("scheduled_visits").insert(row);
  if (!error) return {};

  // Databases missing the newer kind/address columns still get the visit.
  const { kind: _k, address: _a, ...legacy } = row;
  const retry = await supabase.from("scheduled_visits").insert(legacy);
  if (retry.error) return { error: retry.error.message };
  return {};
}

/** Edit a scheduled visit from the Calendar tab (RLS scopes it to the
 *  signed-in tech's own rows). */
export async function updateVisit(input: {
  id: string;
  customerName?: string;
  reason?: string;
  todo?: string;
  kind?: "visit" | "call";
  address?: string;
  scheduledAtIso: string;
}): Promise<{ error?: string }> {
  const scheduledAt = new Date(input.scheduledAtIso);
  if (isNaN(scheduledAt.getTime())) return { error: "Bad date." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const row = {
    customer_name: input.customerName?.trim() || null,
    reason: input.reason?.trim() || null,
    todo: input.todo?.trim() || null,
    kind: input.kind === "call" ? "call" : "visit",
    address: input.address?.trim() || null,
    scheduled_at: scheduledAt.toISOString(),
  };
  const { error } = await supabase
    .from("scheduled_visits")
    .update(row)
    .eq("id", input.id)
    .eq("user_id", user.id);
  if (!error) return {};

  const { kind: _k, address: _a, ...legacy } = row;
  const retry = await supabase
    .from("scheduled_visits")
    .update(legacy)
    .eq("id", input.id)
    .eq("user_id", user.id);
  if (retry.error) return { error: retry.error.message };
  return {};
}

/** Get (creating if needed) the secret token for this tech's calendar feed,
 *  so Apple/Google Calendar can subscribe to their scheduled visits. */
export async function getCalendarToken(): Promise<{
  token?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { data, error } = await supabase
    .from("profiles")
    .select("calendar_token")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return { error: error.message };

  let token = data?.calendar_token as string | null | undefined;
  if (!token) {
    token = crypto.randomUUID();
    const upd = await supabase
      .from("profiles")
      .update({ calendar_token: token })
      .eq("id", user.id);
    if (upd.error) return { error: upd.error.message };
  }
  return { token };
}

/** Remove a scheduled visit. */
export async function deleteVisit(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase
    .from("scheduled_visits")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  return {};
}
