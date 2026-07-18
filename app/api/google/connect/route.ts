import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isGoogleConfigured,
  authorizeUrl,
  requestOrigin,
} from "@/lib/google-drive";

export const runtime = "nodejs";

// Kicks off the Google OAuth flow for Drive backup.
export async function GET(req: Request) {
  if (!isGoogleConfigured) redirect("/settings?driveError=notconfigured");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("tt_google_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  redirect(authorizeUrl(`${requestOrigin(req)}/api/google/callback`, state));
}
