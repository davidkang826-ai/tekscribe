import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import Recorder from "@/components/Recorder";
import BottomNav from "@/components/BottomNav";
import DriveBackupPrompt from "@/components/DriveBackupPrompt";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isGoogleConfigured } from "@/lib/google-drive";
import type { Customer } from "@/lib/types";

export default async function Home() {
  let authed = false;
  let customers: Customer[] = [];
  let replyTo = "";
  let userId = "";
  let techName = "";
  let techPhone = "";
  let offerDriveBackup = false;

  // Once Supabase is configured, the app requires a verified account with a
  // phone number. Until then it stays open so the core loop is demoable.
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // One round trip each, but all in flight at once — this page used to run
    // them back to back, which is most of what made navigation feel slow.
    // Optional columns (display_name, plan_selected, google_refresh_token)
    // are fetched separately and tolerated on error, so a database where a
    // migration hasn't run can never break the home page.
    const [profileRes, nameRes, planRes, driveRes, custsRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("phone, reply_to_email")
          .eq("id", user.id)
          .single(),
        supabase
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("plan_selected")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("google_refresh_token")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("customers")
          .select("name, email, phone")
          .order("name", { ascending: true }),
      ]);

    const profile = profileRes.data;
    if (!profile?.phone) redirect("/onboarding");
    replyTo = profile.reply_to_email || user.email || "";
    techPhone = profile.phone || "";

    techName = (!nameRes.error && nameRes.data?.display_name) || "";

    // Right after signup, send them to pick a plan, once. Loop-safe: only gate
    // when the column exists and is explicitly false (never when it's missing).
    if (
      !planRes.error &&
      planRes.data &&
      planRes.data.plan_selected === false
    ) {
      redirect("/plans");
    }

    // First-run nudge: offer the Google Drive backup until they connect it.
    offerDriveBackup =
      isGoogleConfigured && !driveRes.error && !driveRes.data?.google_refresh_token;

    customers = custsRes.data ?? [];
    userId = user.id;

    authed = true;
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="w-full px-5 pt-5 pb-2">
        <Logo size={30} />
      </header>

      <main className="flex-1 flex flex-col w-full max-w-3xl mx-auto px-5 pt-6 pb-28">
        {/* my-auto centers the greeting + mic in the viewport on tall screens
            and degrades to normal top flow once content grows past it. The
            greeting itself lives in Recorder so it disappears after
            recording. */}
        <div className="my-auto w-full">
          <Recorder
            canSave={authed}
            customers={customers}
            replyTo={replyTo}
            userId={userId}
            techName={techName}
            techPhone={techPhone}
          />
        </div>
      </main>

      {authed && offerDriveBackup && <DriveBackupPrompt />}
      {authed && <BottomNav />}
    </div>
  );
}
