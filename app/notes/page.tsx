import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import ArchiveList, { type ArchiveNote } from "@/components/ArchiveList";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const NOTE_COLS =
  "id, job_title, customer_name, transcript, summary, customer_email, created_at";

export default async function NotesPage() {
  if (!isSupabaseConfigured) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Notes plus each customer's next scheduled visit, in parallel. Both are
  // tolerant of migrations that haven't run yet (Drive columns, visits table).
  const [withDrive, nextRes] = await Promise.all([
    supabase
      .from("voice_notes")
      .select(`${NOTE_COLS}, drive_folder_id, drive_synced_at`)
      .order("created_at", { ascending: false }),
    supabase
      .from("scheduled_visits")
      .select("customer_name, scheduled_at")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true }),
  ]);

  let rows: ArchiveNote[] = [];
  if (!withDrive.error) {
    rows = (withDrive.data ?? []) as ArchiveNote[];
  } else {
    const { data: notes } = await supabase
      .from("voice_notes")
      .select(NOTE_COLS)
      .order("created_at", { ascending: false });
    rows = (notes ?? []) as ArchiveNote[];
  }

  // First upcoming visit per customer.
  const nextVisits: Record<string, string> = {};
  if (!nextRes.error) {
    for (const v of nextRes.data ?? []) {
      const name = (v.customer_name as string | null)?.trim();
      if (name && !(name in nextVisits))
        nextVisits[name] = v.scheduled_at as string;
    }
  }

  return (
    <div className="min-h-full flex flex-col">
      <AppHeader />

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 pt-4 pb-28">
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-4">
          Archive
        </h1>

        <ArchiveList rows={rows} nextVisits={nextVisits} />
      </main>

      <BottomNav />
    </div>
  );
}
