import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import SignOutButton from "@/components/SignOutButton";
import BottomNav from "@/components/BottomNav";
import SettingsForm from "@/components/SettingsForm";
import PlanCard from "@/components/PlanCard";
import DeleteAccountButton from "@/components/DeleteAccountButton";
import { planById } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function SettingsPage() {
  if (!isSupabaseConfigured) redirect("/");

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

        <SettingsForm
          displayName={profile?.display_name ?? ""}
          replyTo={profile?.reply_to_email ?? user.email ?? ""}
          businessName={profile?.business_name ?? ""}
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
