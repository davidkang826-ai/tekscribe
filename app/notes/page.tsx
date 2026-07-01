import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { JobSummary } from "@/lib/types";

type NoteRow = {
  id: string;
  job_title: string | null;
  transcript: string;
  summary: JobSummary | null;
  customer_email: string | null;
  created_at: string;
};

export default async function NotesPage() {
  if (!isSupabaseConfigured) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notes } = await supabase
    .from("voice_notes")
    .select("id, job_title, transcript, summary, customer_email, created_at")
    .order("created_at", { ascending: false });

  const rows = (notes ?? []) as NoteRow[];

  return (
    <div className="min-h-full flex flex-col">
      <header className="w-full border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/">
            <Logo size={30} />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs font-medium text-muted hover:text-foreground transition"
            >
              New note
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-10">
        <h1 className="text-xl font-semibold text-foreground mb-6">Archive</h1>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-muted">
            No saved jobs yet. Record a note and tap{" "}
            <span className="font-medium text-foreground">Save</span>.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((note) => (
              <li key={note.id}>
                <Link
                  href={`/notes/${note.id}`}
                  className="block rounded-2xl border border-border bg-surface p-5 shadow-sm hover:border-brand/40 hover:shadow transition"
                >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-semibold text-foreground">
                    {note.job_title || "Service visit"}
                  </h2>
                  <time className="text-xs text-muted whitespace-nowrap">
                    {new Date(note.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                </div>

                {note.summary?.workDone?.length ? (
                  <ul className="mt-2 space-y-1">
                    {note.summary.workDone.map((item, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-[15px] text-foreground"
                      >
                        <span className="text-brand">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[15px] text-muted line-clamp-2">
                    {note.transcript}
                  </p>
                )}

                {note.customer_email && (
                  <p className="mt-3 text-xs text-muted">
                    Sent to {note.customer_email}
                  </p>
                )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
