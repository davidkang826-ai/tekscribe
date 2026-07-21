import Link from "next/link";
import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import SignOutButton from "@/components/SignOutButton";
import BottomNav from "@/components/BottomNav";
import SettingsForm from "@/components/SettingsForm";
import PlanCard from "@/components/PlanCard";
import DeleteAccountButton from "@/components/DeleteAccountButton";
import GoogleDriveCard from "@/components/GoogleDriveCard";
import { planById } from "@/lib/plans";
import { isGoogleConfigured } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Turn the driveError code from the OAuth callback into advice a human can
 *  act on. Unrecognized codes still show, so no failure is ever anonymous. */
function driveErrorMessage(code: string): string {
  if (code === "access_denied")
    return "Google didn't grant access. If you hit Cancel, just try again. If Google said access was blocked, the OAuth app is still in Testing mode; publish it or add yourself as a test user in the Google Cloud console.";
  if (code === "invalid_client" || code === "unauthorized_client")
    return "Google rejected the app's credentials. The client ID or secret configured on the server doesn't match the OAuth client. Update them and redeploy.";
  if (code === "redirect_uri_mismatch")
    return "This site's callback address isn't on the OAuth client's Authorized redirect URIs in the Google Cloud console.";
  if (code === "invalid_grant")
    return "The sign-in code expired or was already used. Give it another try.";
  if (code === "state")
    return "The security check didn't match. The attempt may have sat too long, or cookies were blocked. Give it another try.";
  if (code === "nocode")
    return "Google sent you back without an authorization code. Give it another try.";
  if (code === "notconfigured")
    return "Google Drive backup isn't configured on the server yet.";
  if (code.includes("(403)"))
    return "Google Drive said no (403). Most likely the Google Drive API isn't enabled for the project in the Google Cloud console.";
  return `Couldn't connect Google Drive (${code}). Give it another try.`;
}

export default async function SettingsPage(props: {
  searchParams: Promise<{
    drive?: string;
    driveError?: string;
    deleteError?: string;
  }>;
}) {
  if (!isSupabaseConfigured) redirect("/");
  const { drive, driveError, deleteError } = await props.searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // All independent lookups go out in parallel — sequential round trips were
  // making this page feel slow. Optional columns stay tolerated on error, so
  // a database where a migration hasn't run can never break Settings.
  const monthStart = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  })();
  const [profileRes, planRes, driveRes, notesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, reply_to_email, business_name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profiles")
      .select("plan, plan_status, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("google_refresh_token, google_drive_email")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("voice_notes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart),
  ]);

  const profile = profileRes.data;

  // Plan info, tolerated if the migration hasn't run yet.
  let planId = "free";
  let planStatus: string | null = null;
  let hasBilling = false;
  if (!planRes.error && planRes.data) {
    planId = planRes.data.plan || "free";
    planStatus = planRes.data.plan_status ?? null;
    hasBilling = !!planRes.data.stripe_customer_id;
  }
  const planName = planById(planId)?.name ?? "Free";

  // Google Drive connection, tolerated if the migration hasn't run yet.
  let driveConnected = false;
  let driveEmail: string | null = null;
  if (!driveRes.error && driveRes.data) {
    driveConnected = !!driveRes.data.google_refresh_token;
    driveEmail = driveRes.data.google_drive_email ?? null;
  }

  // Notes left this calendar month (only matters on a capped plan like Free).
  const notesLimit = planById(planId)?.notesPerMonth ?? null;
  const notesUsed = notesLimit !== null ? (notesRes.count ?? 0) : 0;

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <AppHeader />

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain w-full max-w-lg mx-auto px-5 pt-4 pb-28 space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Settings
        </h1>

        {drive === "connected" && (
          <div className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-success ring-1 ring-green-100">
            ✓ Google Drive connected. New saved visits back up automatically.
          </div>
        )}
        {driveError && (
          <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-danger ring-1 ring-red-100">
            {driveErrorMessage(driveError)}
          </div>
        )}
        {deleteError && (
          <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-danger ring-1 ring-red-100">
            Couldn&apos;t delete your account just now. Try again, or contact
            support.
          </div>
        )}

        <SettingsForm
          displayName={profile?.display_name ?? ""}
          replyTo={profile?.reply_to_email ?? user.email ?? ""}
          businessName={profile?.business_name ?? ""}
        />

        <GoogleDriveCard
          connected={driveConnected}
          email={driveEmail}
          configured={isGoogleConfigured}
        />

        <PlanCard
          planName={planName}
          planStatus={planStatus}
          hasBilling={hasBilling}
          notesUsed={notesUsed}
          notesLimit={notesLimit}
        />

        <div className="flex items-center justify-between border-t border-border pt-5">
          <SignOutButton />
          <div className="flex gap-4 text-xs text-muted">
            <Link href="/privacy" className="hover:text-foreground transition">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition">
              Terms
            </Link>
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-danger mb-2">
            Danger zone
          </div>
          <DeleteAccountButton />
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
