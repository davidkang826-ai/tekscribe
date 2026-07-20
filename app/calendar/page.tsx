import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import BottomNav from "@/components/BottomNav";
import CalendarView from "@/components/CalendarView";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function CalendarPage() {
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

      <main className="flex-1 w-full max-w-lg mx-auto px-5 pt-4 pb-28">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Calendar
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your work schedule. Visits scheduled from notes land here
          automatically.
        </p>

        {/* Client-side so days and times use the tech's timezone. */}
        <CalendarView />
      </main>

      <BottomNav />
    </div>
  );
}
