import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, reply_to_email, business_name")
    .eq("id", user.id)
    .single();

  // Plan info, tolerated if the migration hasn't run yet.
  let planId = "free";
  let planStatus: string | null = null;
  let hasBilling = false;
  const { data: planRow, error: planErr } = await supabase
    .from("profiles")
    .select("plan, plan_status, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!planErr && planRow) {
    planId = planRow.plan || "free";
    planStatus = planRow.plan_status ?? null;
    hasBilling = !!planRow.stripe_customer_id;
  }
  const planName = planById(planId)?.name ?? "Free";

  // Google Drive connection, tolerated if the migration hasn't run yet.
  let driveConnected = false;
  let driveEmail: string | null = null;
  const { data: driveRow, error: driveErr } = await supabase
    .from("profiles")
    .select("google_refresh_token, google_drive_email")
    .eq("id", user.id)
    .maybeSingle();
  if (!driveErr && driveRow) {
    driveConnected = !!driveRow.google_refresh_token;
    driveEmail = driveRow.google_drive_email ?? null;
  }

  // Notes left this calendar month (only matters on a capped plan like Free).
  const notesLimit = planById(planId)?.notesPerMonth ?? null;
  let notesUsed = 0;
  if (notesLimit !== null) {
    const now = new Date();
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();
    const { count } = await supabase
      .from("voice_notes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart);
    notesUsed = count ?? 0;
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="w-full px-5 pt-5 pb-2">
        <Link href="/">
          <Logo size={30} />
        </Link>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-5 pt-4 pb-28 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted">
            Your name and where customer replies go.
          </p>
        </div>

        {drive === "connected" && (
          <div className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-success ring-1 ring-green-100">
            ✓ Google Drive connected. New saved visits back up automatically.
          </div>
        )}
        {driveError && (
          <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-danger ring-1 ring-red-100">
            Couldn&apos;t connect Google Drive. Give it another try.
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
