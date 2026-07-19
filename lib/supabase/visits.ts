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
