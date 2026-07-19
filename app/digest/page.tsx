import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
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
      <header className="w-full px-5 pt-5 pb-2">
        <Link href="/">
          <Logo size={30} />
        </Link>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 pt-4 pb-28">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Daily Digest
        </h1>
        <p className="mt-1 text-sm text-muted">
          Today&apos;s visits: where to go, what to do, what to bring.
        </p>

        {/* Client-side so "today" means the tech's timezone, not the server's. */}
        <DigestList />
      </main>

      <BottomNav />
    </div>
  );
}
