import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isGoogleConfigured,
  exchangeCode,
  emailFromIdToken,
  ensureFolder,
  requestOrigin,
  ROOT_FOLDER_NAME,
} from "@/lib/google-drive";

export const runtime = "nodejs";

// Google sends the tech back here after they approve (or deny) Drive access.
export async function GET(req: Request) {
  if (!isGoogleConfigured) redirect("/settings?driveError=notconfigured");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("tt_google_state")?.value;
  cookieStore.delete("tt_google_state");

  // Carry the failure cause to Settings so the tech (and we) can see what
  // actually went wrong instead of one vague catch-all message.
  if (googleError)
    redirect(`/settings?driveError=${encodeURIComponent(googleError)}`);
  if (!code) redirect("/settings?driveError=nocode");
  if (!state || !expectedState || state !== expectedState)
    redirect("/settings?driveError=state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let refreshToken = "";
  let email = "";
  let folderId = "";
  let failure = "";
  try {
    const tokens = await exchangeCode(
      code,
      `${requestOrigin(req)}/api/google/callback`
    );
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error(tokens.error || "no_tokens");
    }
    refreshToken = tokens.refresh_token;
    email = emailFromIdToken(tokens.id_token);
    // Create the root folder right away so it shows up in their Drive.
    folderId = await ensureFolder(tokens.access_token, ROOT_FOLDER_NAME);
  } catch (err) {
    console.error("[google callback]", err);
    failure = err instanceof Error ? err.message : "unknown";
  }
  // redirect() throws internally, so it must happen outside the try/catch.
  if (failure)
    redirect(`/settings?driveError=${encodeURIComponent(failure.slice(0, 80))}`);

  await supabase
    .from("profiles")
    .update({
      google_refresh_token: refreshToken,
      google_drive_email: email || null,
      google_drive_folder_id: folderId || null,
    })
    .eq("id", user.id);

  redirect("/settings?drive=connected");
}
