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
      .select("phone")
      .eq("id", user.id)
      .single();
    if (!profile?.phone) redirect("/onboarding");

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
            <div className="flex items-center gap-4">
              <Link
                href="/templates"
                className="text-xs font-medium text-muted hover:text-foreground transition"
              >
                Templates
              </Link>
              <Link
                href="/notes"
                className="text-xs font-medium text-muted hover:text-foreground transition"
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
            Record a quick voice note from wherever you are. TechTalk transcribes
            it, converts it into a detailed note, fills out any of your
            templates, and writes a customer update email or text for you.
          </p>
        </div>

        <Recorder canSave={authed} templates={templates} />
      </main>

      <footer className="w-full border-t border-border py-6 text-center text-xs text-muted">
        TechTalk · voice-to-summary for the trades
      </footer>
    </div>
  );
}
