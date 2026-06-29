import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import OnboardingForm from "@/components/OnboardingForm";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function OnboardingPage() {
  if (!isSupabaseConfigured) redirect("/");

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

  // Already onboarded — skip straight to the app.
  if (profile?.phone) redirect("/");

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo size={34} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm text-center">
          <h1 className="text-xl font-semibold text-foreground mb-1">
            One last step
          </h1>
          <p className="text-sm text-muted mb-5">
            A couple details so you can text and email customers right from a
            job.
          </p>
          <OnboardingForm signupEmail={user.email ?? ""} />
        </div>
      </div>
    </div>
  );
}
