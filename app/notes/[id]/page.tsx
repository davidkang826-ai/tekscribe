import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import SendToCustomer from "@/components/SendToCustomer";
import { GoogleDriveLogo } from "@/components/GoogleDriveLogo";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { JobSummary, Attachment } from "@/lib/types";

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

  // Ask for the Drive-backup columns too, falling back without them on
  // databases where that migration hasn't run yet.
  const noteCols =
    "id, job_title, customer_name, transcript, summary, customer_email, attachments, created_at";
  type NoteRecord = {
    id: string;
    job_title: string | null;
    customer_name: string | null;
    transcript: string;
    summary: unknown;
    customer_email: string | null;
    customer_phone?: string | null;
    customer_address?: string | null;
    attachments: unknown;
    created_at: string;
    drive_folder_id?: string | null;
    drive_synced_at?: string | null;
  };
  let note: NoteRecord | null = null;
  // Try the fullest select; fall back progressively for databases where the
  // contact / Drive columns don't exist yet.
  const full = await supabase
    .from("voice_notes")
    .select(
      `${noteCols}, customer_phone, customer_address, drive_folder_id, drive_synced_at`
    )
    .eq("id", id)
    .single();
  if (!full.error) {
    note = full.data;
  } else {
    const withDrive = await supabase
      .from("voice_notes")
      .select(`${noteCols}, drive_folder_id, drive_synced_at`)
      .eq("id", id)
      .single();
    if (!withDrive.error) {
      note = withDrive.data;
    } else {
      const { data } = await supabase
        .from("voice_notes")
        .select(noteCols)
        .eq("id", id)
        .single();
      note = data;
    }
  }
  if (!note) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("reply_to_email, display_name, phone")
    .eq("id", user.id)
    .single();
  const replyTo = profile?.reply_to_email || user.email || "";
  const techName = profile?.display_name || "";
  const techPhone = profile?.phone || "";

  const summary = note.summary as JobSummary | null;

  // Sign URLs for any attached photos/files so they can be shown/downloaded.
  const rawAttachments = (note.attachments as Attachment[] | null) ?? [];
  const attachments = await Promise.all(
    rawAttachments.map(async (a) => {
      const { data } = await supabase.storage
        .from("visit-media")
        .createSignedUrl(a.path, 60 * 60);
      return { ...a, url: data?.signedUrl ?? "" };
    })
  );

  return (
    <div className="min-h-full flex flex-col">
      <AppHeader />

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 pt-2 pb-28">
        <Link
          href="/notes"
          className="text-sm font-medium text-brand hover:underline"
        >
          Back to Archive
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

        {/* Client details lead the note: name, phone, email, address, each
            tappable to call, email, or open in maps. */}
        {(note.customer_name ||
          note.customer_phone ||
          note.customer_email ||
          note.customer_address) && (
          <div className="mt-3 rounded-2xl border border-border bg-brand-50/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-2">
              Client
            </div>
            {note.customer_name && (
              <p className="text-base font-semibold text-foreground">
                {note.customer_name}
              </p>
            )}
            <div className="mt-1 space-y-1 text-sm">
              {note.customer_phone && (
                <a
                  href={`tel:${note.customer_phone.replace(/[^\d+]/g, "")}`}
                  className="block font-medium text-brand hover:underline"
                >
                  📞 {note.customer_phone}
                </a>
              )}
              {note.customer_email && (
                <a
                  href={`mailto:${note.customer_email}`}
                  className="block font-medium text-brand hover:underline"
                >
                  ✉️ {note.customer_email}
                </a>
              )}
              {note.customer_address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    note.customer_address
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block font-medium text-brand hover:underline"
                >
                  📍 {note.customer_address}
                </a>
              )}
            </div>
          </div>
        )}

        {note.drive_folder_id && note.drive_synced_at && (
          <a
            href={`https://drive.google.com/drive/folders/${note.drive_folder_id}`}
            target="_blank"
            rel="noreferrer"
            className="tt-pop mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-success ring-1 ring-green-100 hover:bg-green-100 transition"
          >
            ✓ Backed up · <GoogleDriveLogo size={13} /> Open in Google Drive
          </a>
        )}

        {attachments.length > 0 && (
          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Photos & files
            </div>
            <div className="flex flex-wrap gap-3">
              {attachments.map((a) =>
                a.type.startsWith("image/") ? (
                  <a
                    key={a.path}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="tt-pop block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url}
                      alt={a.name}
                      className="h-24 w-24 rounded-lg object-cover ring-1 ring-border"
                    />
                  </a>
                ) : (
                  <a
                    key={a.path}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="tt-pop flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg bg-surface text-center ring-1 ring-border p-2"
                  >
                    <span className="text-2xl">📄</span>
                    <span className="text-[10px] text-muted truncate max-w-full">
                      {a.name}
                    </span>
                  </a>
                )
              )}
            </div>
          </div>
        )}

        {summary && (
          <div className="mt-5 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <Section title="Work done" items={summary.workDone} />
            <Section
              title="Parts & materials"
              items={summary.partsAndMaterials}
              accent
            />
            <Section title="Customer requests" items={summary.customerRequests} />
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
            <SendToCustomer
              summary={summary}
              defaultReplyTo={replyTo}
              techName={techName}
              techPhone={techPhone}
            />
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

      <BottomNav />
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
