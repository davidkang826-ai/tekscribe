import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import Recorder from "@/components/Recorder";
import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Customer } from "@/lib/types";

export default async function Home() {
  let authed = false;
  let customers: Customer[] = [];
  let replyTo = "";
  let userId = "";
  let techName = "";

  // Once Supabase is configured, the app requires a verified account with a
  // phone number. Until then it stays open so the core loop is demoable.
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone, reply_to_email")
      .eq("id", user.id)
      .single();
    if (!profile?.phone) redirect("/onboarding");
    replyTo = profile.reply_to_email || user.email || "";

    // display_name is optional and may not exist yet on databases where the
    // migration hasn't run. Fetch it on its own and tolerate failure, so a
    // missing column can never break the home page (which previously looped
    // to /onboarding and back for signed-in users).
    try {
      const { data: nameRow } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      techName = nameRow?.display_name || "";
    } catch {
      techName = "";
    }

    const { data: custs } = await supabase
      .from("customers")
      .select("name, email, phone")
      .order("name", { ascending: true });
    customers = custs ?? [];
    userId = user.id;

    authed = true;
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="w-full border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <Logo size={30} />
          {authed ? (
            <div className="flex items-center gap-5">
              <Link
                href="/notes"
                className="tt-pop text-sm font-medium text-muted hover:text-foreground transition-colors leading-none"
              >
                Archive
              </Link>
              <Link
                href="/settings"
                className="tt-pop text-sm font-medium text-muted hover:text-foreground transition-colors leading-none"
              >
                Settings
              </Link>
              <SignOutButton />
            </div>
          ) : (
            <span className="text-xs font-medium text-muted">
              for field-service pros
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-10 sm:py-14">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Your intelligent scribe
          </h1>
          <p className="mt-2 text-muted max-w-lg mx-auto">
            We listen and analyze so you can focus on the job.
          </p>
        </div>

        <Recorder
          canSave={authed}
          customers={customers}
          replyTo={replyTo}
          userId={userId}
          techName={techName}
        />
      </main>

      <footer className="w-full border-t border-border py-6 text-center text-xs text-muted space-y-1">
        <div>TekScribe · voice-to-summary for the trades</div>
        <div className="flex justify-center gap-4">
          <Link href="/privacy" className="hover:text-foreground transition">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
