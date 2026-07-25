import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyNewAccount } from "@/lib/notify";

export const runtime = "nodejs";

/** Tell the owner a new account just confirmed its email. Best-effort. */
async function alertConfirmed(supabase: SupabaseClient) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    let businessName = "";
    try {
      const { data } = await supabase
        .from("profiles")
        .select("business_name")
        .eq("id", user.id)
        .maybeSingle();
      businessName = (data?.business_name as string) ?? "";
    } catch {
      // profile not readable; send with just the email
    }
    await notifyNewAccount({ email: user.email ?? "", businessName });
  } catch (err) {
    console.error("[confirm] alertConfirmed", err);
  }
}

/**
 * Handles the link in the verification email. Supports both Supabase email
 * flows: the token_hash + type template, and the PKCE `code` exchange.
 * On success, sends the tech to onboarding to add their phone number.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // Only a signup confirmation is a "new account" (not recovery or an
      // email change).
      if (type === "signup") after(() => alertConfirmed(supabase));
      return NextResponse.redirect(`${origin}${next}`);
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // The code exchange is the signup-confirmation path; recovery uses a
      // separate OTP flow. Guard on the destination to be safe.
      if (!next.startsWith("/reset-password")) {
        after(() => alertConfirmed(supabase));
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // The token was consumed or expired (mail apps pre-open links to scan
  // them, burning one-time tokens). If the person is already signed in,
  // the destination is still legitimately theirs: send them on so a reset
  // link always lands on the set-new-password screen.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return NextResponse.redirect(`${origin}${next}`);

  return NextResponse.redirect(`${origin}/login?error=verification`);
}
