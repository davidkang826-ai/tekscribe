import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
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
    <div className="h-dvh flex flex-col overflow-hidden">
      <AppHeader />

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain w-full max-w-lg mx-auto px-5 pt-4 pb-28">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Calendar
        </h1>

        {/* Client-side so days and times use the tech's timezone. */}
        <CalendarView />
      </main>

      <BottomNav />
    </div>
  );
}
