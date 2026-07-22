"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncNoteToDrive } from "@/lib/drive-sync";
import { planById } from "@/lib/plans";
import { resolvePlan, type PlanFields } from "@/lib/plan-resolve";
import type { JobSummary, Attachment } from "@/lib/types";

export type SaveResult = { error?: string; id?: string; limitReached?: boolean };

/** First moment of the current calendar month, for the monthly note cap. */
function startOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/**
 * True only when a write failed because the newer contact columns aren't in
 * the table yet (migration not run), so retrying without them is safe. Any
 * other error means something real went wrong, and we must NOT silently retry
 * a second insert, since that could duplicate the note.
 */
function isMissingContactColumn(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false;
  // 42703 = undefined_column (Postgres); PGRST204 = column missing from the
  // PostgREST schema cache.
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("customer_phone") ||
    msg.includes("customer_address") ||
    (msg.includes("column") && msg.includes("does not exist"))
  );
}

export async function saveNote(input: {
  transcript: string;
  summary: JobSummary | null;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  attachments?: Attachment[];
}): Promise<SaveResult> {
  if (!input.transcript?.trim()) return { error: "Nothing to save yet." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in to save." };

  // Enforce the plan's monthly note cap (Free = 5). Only new notes count;
  // updateNote edits an existing one in place and never hits this path. A promo
  // or paid plan lifts the cap; an expired promo falls back to Free.
  let planFields: PlanFields | null = null;
  const withExp = await supabase
    .from("profiles")
    .select("plan, plan_status, plan_expires_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!withExp.error) {
    planFields = withExp.data;
  } else {
    // plan_expires_at column not there yet: fall back to what does exist.
    const basic = await supabase
      .from("profiles")
      .select("plan, plan_status")
      .eq("id", user.id)
      .maybeSingle();
    planFields = basic.data;
  }
  const planId = resolvePlan(planFields);
  const monthlyLimit = planById(planId)?.notesPerMonth ?? null;
  if (monthlyLimit !== null) {
    const { count } = await supabase
      .from("voice_notes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonthIso());
    if ((count ?? 0) >= monthlyLimit) {
      return {
        limitReached: true,
        error: `You've saved all ${monthlyLimit} of your free notes this month. Upgrade to Pro for unlimited notes.`,
      };
    }
  }

  const base = {
    user_id: user.id,
    job_title: input.summary?.jobTitle ?? null,
    customer_name: input.customerName?.trim() || null,
    transcript: input.transcript.trim(),
    summary: input.summary,
    customer_email: input.customerEmail || null,
    attachments: input.attachments?.length ? input.attachments : null,
  };
  const full = {
    ...base,
    customer_phone: input.customerPhone?.trim() || null,
    customer_address: input.customerAddress?.trim() || null,
  };
  // Try with the newer contact columns; fall back if the migration hasn't run.
  let data: { id: string } | null = null;
  const first = await supabase
    .from("voice_notes")
    .insert(full)
    .select("id")
    .single();
  if (!first.error) {
    data = first.data;
  } else if (isMissingContactColumn(first.error)) {
    // The contact columns aren't there yet; retry without them.
    const retry = await supabase
      .from("voice_notes")
      .insert(base)
      .select("id")
      .single();
    if (retry.error) return { error: retry.error.message };
    data = retry.data;
  } else {
    // A real failure (permissions, connectivity, a half-applied write). Don't
    // fire a second insert, that risks a duplicate note. Surface it instead.
    return { error: first.error.message };
  }
  if (!data) return { error: "Couldn't save the note." };

  // Mirror the note and its photos/files into their Google Drive after the
  // response is sent.
  const userId = user.id;
  const savedId = data.id as string;
  after(() => syncNoteToDrive(userId, savedId, input));

  return { id: savedId };
}

/** Update an already-saved note in place, used when the tech goes back from
 *  the send step and changes the note, so edits never create a duplicate. */
export async function updateNote(
  id: string,
  input: {
    transcript: string;
    summary: JobSummary | null;
    customerEmail?: string;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    attachments?: Attachment[];
  }
): Promise<SaveResult> {
  if (!input.transcript?.trim()) return { error: "Nothing to save yet." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in to save." };

  const base = {
    job_title: input.summary?.jobTitle ?? null,
    customer_name: input.customerName?.trim() || null,
    transcript: input.transcript.trim(),
    summary: input.summary,
    customer_email: input.customerEmail || null,
    attachments: input.attachments?.length ? input.attachments : null,
  };
  const full = {
    ...base,
    customer_phone: input.customerPhone?.trim() || null,
    customer_address: input.customerAddress?.trim() || null,
  };
  const upd = await supabase
    .from("voice_notes")
    .update(full)
    .eq("id", id)
    .eq("user_id", user.id);
  if (upd.error) {
    if (isMissingContactColumn(upd.error)) {
      const retry = await supabase
        .from("voice_notes")
        .update(base)
        .eq("id", id)
        .eq("user_id", user.id);
      if (retry.error) return { error: retry.error.message };
    } else {
      return { error: upd.error.message };
    }
  }

  // Any newly added photos/files also mirror to Drive (existing ones skip),
  // and the note document updates in place.
  const userId = user.id;
  after(() => syncNoteToDrive(userId, id, input));

  return { id };
}

/** Attach the AI summary to an already-saved note (Save happens before Summarize). */
export async function updateNoteSummary(
  id: string,
  summary: JobSummary
): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in." };

  const { error } = await supabase
    .from("voice_notes")
    .update({ summary, job_title: summary.jobTitle })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { id };
}

/** Delete a single archived note (and its stored photos/files), then reload
 *  the archive. RLS also scopes the delete to the signed-in tech's own notes. */
export async function deleteNote(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Remove any attached files from storage first (best effort).
  const { data: note } = await supabase
    .from("voice_notes")
    .select("attachments")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const paths = ((note?.attachments as { path?: string }[] | null) ?? [])
    .map((a) => a?.path)
    .filter((p): p is string => !!p);
  if (paths.length) {
    try {
      await supabase.storage.from("visit-media").remove(paths);
    } catch {
      // best-effort
    }
  }

  await supabase
    .from("voice_notes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/notes");
  redirect("/notes");
}
