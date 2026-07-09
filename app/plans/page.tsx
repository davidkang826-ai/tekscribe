import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import BottomNav from "@/components/BottomNav";
import PlanChooser from "@/components/PlanChooser";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isStripeConfigured } from "@/lib/stripe";
import { planDisplays } from "@/lib/plans";

export default async function PlansPage(props: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/");
  const { success } = await props.searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Current plan, tolerated if the migration hasn't run yet.
  let currentPlan = "free";
  const { data: prof, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  if (!error && prof?.plan) currentPlan = prof.plan;

  return (
    <div className="min-h-full flex flex-col">
      <header className="w-full px-5 pt-5 pb-2">
        <Link href="/">
          <Logo size={30} />
        </Link>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 pt-6 pb-28">
        {success ? (
          <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
            <div className="text-4xl mb-2">🎉</div>
            <h1 className="text-xl font-bold text-foreground">You&apos;re all set</h1>
            <p className="mt-2 text-muted">
              Your subscription is active. Thanks for backing TekScribe.
            </p>
            <Link
              href="/"
              className="tt-pop mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-white font-semibold shadow-sm hover:bg-brand-600 transition"
            >
              Start using TekScribe →
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Pick your plan
              </h1>
              <p className="mt-2 text-muted">
                Start free. Upgrade when you&apos;re running more jobs.
              </p>
            </div>
            <PlanChooser
              tiers={planDisplays()}
              currentPlan={currentPlan}
              stripeReady={isStripeConfigured}
            />
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
