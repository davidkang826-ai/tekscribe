import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import SignOutButton from "@/components/SignOutButton";
import SendToCustomer from "@/components/SendToCustomer";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { JobSummary } from "@/lib/types";

export default async function NoteDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/");

  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: note } = await supabase
    .from("voice_notes")
    .select("id, job_title, transcript, summary, customer_email, created_at")
    .eq("id", id)
    .single();
  if (!note) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("reply_to_email")
    .eq("id", user.id)
    .single();
  const replyTo = profile?.reply_to_email || user.email || "";

  const summary = note.summary as JobSummary | null;

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

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-8">
        <Link
          href="/notes"
          className="text-sm font-medium text-brand hover:underline"
        >
          ← Archive
        </Link>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            {note.job_title || "Service visit"}
          </h1>
          <time className="text-xs text-muted whitespace-nowrap">
            {new Date(note.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>

        {summary && (
          <div className="mt-5 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <Section title="Work done" items={summary.workDone} />
            <Section
              title="Parts & materials"
              items={summary.partsAndMaterials}
              accent
            />
            <Section title="Next steps" items={summary.nextSteps} />
            {summary.customerMessage && (
              <div className="mt-4 rounded-xl bg-brand-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1.5">
                  Customer message
                </div>
                <p className="text-[15px] leading-relaxed text-foreground">
                  {summary.customerMessage}
                </p>
              </div>
            )}

            {/* Re-send this job to a customer */}
            <SendToCustomer summary={summary} defaultReplyTo={replyTo} />
          </div>
        )}

        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Original transcript
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 text-[15px] leading-relaxed text-foreground whitespace-pre-wrap shadow-sm">
            {note.transcript}
          </div>
          {!summary && (
            <p className="mt-3 text-sm text-muted">
              This note wasn&apos;t summarized. Record a new one to get an AI
              summary and customer message.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  items,
  accent,
}: {
  title: string;
  items?: string[];
  accent?: boolean;
}) {
  if (!items || !items.length) return null;
  return (
    <div className="mt-4 first:mt-0">
      <div
        className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${
          accent ? "text-accent-600" : "text-muted"
        }`}
      >
        {title}
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-[15px] text-foreground">
            <span className={accent ? "text-accent" : "text-brand"}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
