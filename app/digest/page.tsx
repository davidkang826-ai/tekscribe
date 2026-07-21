import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import DigestList from "@/components/DigestList";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function DigestPage() {
  if (!isSupabaseConfigured) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-full flex flex-col">
      <AppHeader />

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 pt-4 pb-28">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Daily Digest
        </h1>

        {/* Client-side so "today" means the tech's timezone, not the server's. */}
        <DigestList />
      </main>

      <BottomNav />
    </div>
  );
}
