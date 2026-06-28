"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type TemplateState = { error?: string; ok?: boolean };

export async function addTemplate(
  _prev: TemplateState,
  formData: FormData
): Promise<TemplateState> {
  const name = String(formData.get("name") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!name || !content)
    return { error: "Give the template a name and some content." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("templates")
    .insert({ user_id: user.id, name, content });

  if (error) return { error: error.message };
  revalidatePath("/templates");
  return { ok: true };
}

export async function deleteTemplate(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("templates").delete().eq("id", id);
  revalidatePath("/templates");
}
