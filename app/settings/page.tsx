import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import SignOutButton from "@/components/SignOutButton";
import BottomNav from "@/components/BottomNav";
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
      </main>

      <BottomNav />
    </div>
  );
}
