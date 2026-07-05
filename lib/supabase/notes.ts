"use server";

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
