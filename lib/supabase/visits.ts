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
  scheduledAtIso: string;
}): Promise<{ error?: string }> {
  const scheduledAt = new Date(input.scheduledAtIso);
  if (isNaN(scheduledAt.getTime())) return { error: "Bad date." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase.from("scheduled_visits").insert({
    user_id: user.id,
    note_id: input.noteId || null,
    customer_name: input.customerName?.trim() || null,
    reason: input.reason?.trim() || null,
    todo: input.todo?.trim() || null,
    scheduled_at: scheduledAt.toISOString(),
  });

  if (error) return { error: error.message };
  return {};
}
