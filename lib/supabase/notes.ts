"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { JobSummary, Attachment } from "@/lib/types";

export type SaveResult = { error?: string; id?: string };

export async function saveNote(input: {
  transcript: string;
  summary: JobSummary | null;
  customerEmail?: string;
  customerName?: string;
  attachments?: Attachment[];
}): Promise<SaveResult> {
  if (!input.transcript?.trim()) return { error: "Nothing to save yet." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in to save." };

  const { data, error } = await supabase
    .from("voice_notes")
    .insert({
      user_id: user.id,
      job_title: input.summary?.jobTitle ?? null,
      customer_name: input.customerName?.trim() || null,
      transcript: input.transcript.trim(),
      summary: input.summary,
      customer_email: input.customerEmail || null,
      attachments: input.attachments?.length ? input.attachments : null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
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
    attachments?: Attachment[];
  }
): Promise<SaveResult> {
  if (!input.transcript?.trim()) return { error: "Nothing to save yet." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in to save." };

  const { error } = await supabase
    .from("voice_notes")
    .update({
      job_title: input.summary?.jobTitle ?? null,
      customer_name: input.customerName?.trim() || null,
      transcript: input.transcript.trim(),
      summary: input.summary,
      customer_email: input.customerEmail || null,
      attachments: input.attachments?.length ? input.attachments : null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
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
