import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import SignOutButton from "@/components/SignOutButton";
import SettingsForm from "@/components/SettingsForm";
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

  return (
    <div className="min-h-full flex flex-col">
      <header className="w-full border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/">
            <Logo size={30} />
          </Link>
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="tt-pop text-sm font-medium text-muted hover:text-foreground transition-colors leading-none"
            >
              New note
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-5 py-10 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Your name and where customer replies go.
          </p>
        </div>

        <SettingsForm
          displayName={profile?.display_name ?? ""}
          replyTo={profile?.reply_to_email ?? user.email ?? ""}
          businessName={profile?.business_name ?? ""}
        />
      </main>
    </div>
  );
}
