"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/google-drive";

/** Disconnect Google Drive: revoke our access and forget the connection.
 *  Files already backed up stay in their Drive (it's their data). */
export async function disconnectGoogleDrive(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: prof } = await supabase
    .from("profiles")
    .select("google_refresh_token")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.google_refresh_token) {
    await revokeToken(prof.google_refresh_token);
  }

  await supabase
    .from("profiles")
    .update({
      google_refresh_token: null,
      google_drive_email: null,
      google_drive_folder_id: null,
    })
    .eq("id", user.id);

  revalidatePath("/settings");
}
