"use server";

import { createClient } from "@/lib/supabase/server";

/** Remember a message the tech actually sent, so future AI drafts can mimic
 *  their voice. Best-effort: a missing table breaks nothing. */
export async function saveMessageSample(content: string): Promise<void> {
  const text = content?.trim();
  if (!text) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("message_samples").insert({
    user_id: user.id,
    content: text.slice(0, 4000),
  });
}

/** The tech's most recent sent messages, newest first, for style mimicry. */
export async function recentMessageSamples(limit = 4): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("message_samples")
    .select("content")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => r.content as string);
}
