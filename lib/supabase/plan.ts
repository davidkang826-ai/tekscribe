"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Stay on (or move to) the Free plan and leave the plan-selection screen. */
export async function selectFreePlan(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("profiles")
    .update({ plan: "free", plan_selected: true })
    .eq("id", user.id);

  redirect("/");
}
