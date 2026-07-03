import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import Recorder from "@/components/Recorder";
import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Template } from "@/lib/types";

export default async function Home() {
  let authed = false;
  let templates: Template[] = [];
  let replyTo = "";

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

    const { data: tpls } = await supabase
      .from("templates")
      .select("id, name, content")
      .order("created_at", { ascending: false });
    templates = tpls ?? [];

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
                href="/templates"
                className="tt-pop text-sm font-medium text-muted hover:text-foreground transition-colors leading-none"
              >
                Templates
              </Link>
              <Link
                href="/notes"
                className="tt-pop text-sm font-medium text-muted hover:text-foreground transition-colors leading-none"
              >
                Archive
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
            Congrats on finishing the job!
          </h1>
          <p className="mt-2 text-muted max-w-lg mx-auto">
            Record a quick voice note from wherever you are. Don&apos;t worry
            about the pauses, awkward silences, or corrections. We&apos;ll take
            care of that for you.
          </p>
        </div>

        <Recorder canSave={authed} templates={templates} replyTo={replyTo} />
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
