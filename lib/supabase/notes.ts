"use server";

import { createClient } from "@/lib/supabase/server";
import type { JobSummary } from "@/lib/types";

export type SaveResult = { error?: string; id?: string };

export async function saveNote(input: {
  transcript: string;
  summary: JobSummary | null;
  customerEmail?: string;
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
      transcript: input.transcript.trim(),
      summary: input.summary,
      customer_email: input.customerEmail || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}
