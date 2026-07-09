import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import Recorder from "@/components/Recorder";
import BottomNav from "@/components/BottomNav";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Customer } from "@/lib/types";

export default async function Home() {
  let authed = false;
  let customers: Customer[] = [];
  let replyTo = "";
  let userId = "";
  let techName = "";
  let techPhone = "";

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
    techPhone = profile.phone || "";

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

    // Right after signup, send them to pick a plan, once. Loop-safe: only gate
    // when the column exists and is explicitly false (never when it's missing).
    const { data: planRow, error: planErr } = await supabase
      .from("profiles")
      .select("plan_selected")
      .eq("id", user.id)
      .maybeSingle();
    if (!planErr && planRow && planRow.plan_selected === false) {
      redirect("/plans");
    }

    const { data: custs } = await supabase
      .from("customers")
      .select("name, email, phone")
      .order("name", { ascending: true });
    customers = custs ?? [];
    userId = user.id;

    authed = true;
  }

  const firstName = techName.trim().split(/\s+/)[0] || "";

  return (
    <div className="min-h-full flex flex-col">
      <header className="w-full px-5 pt-5 pb-2">
        <Logo size={30} />
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 pt-6 pb-28 sm:pt-10">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {authed && firstName ? `Hi ${firstName}.` : "Ready when you are."}
          </h1>
          <p className="mt-2 text-muted max-w-lg mx-auto">
            Tap the mic and tell me about your visit.
          </p>
        </div>

        <Recorder
          canSave={authed}
          customers={customers}
          replyTo={replyTo}
          userId={userId}
          techName={techName}
          techPhone={techPhone}
        />
      </main>

      {authed && <BottomNav />}
    </div>
  );
}
