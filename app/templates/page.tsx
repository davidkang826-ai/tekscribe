import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import SignOutButton from "@/components/SignOutButton";
import AddTemplateForm from "@/components/AddTemplateForm";
import { deleteTemplate } from "@/lib/supabase/templates";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function TemplatesPage() {
  if (!isSupabaseConfigured) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: templates } = await supabase
    .from("templates")
    .select("id, name, content, created_at")
    .order("created_at", { ascending: false });

  const rows = templates ?? [];

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

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-10 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Templates</h1>
          <p className="mt-1 text-sm text-muted max-w-lg">
            Upload the documents you fill out by hand today — work orders,
            invoices, inspection reports. After you record a job, TekScribe fills
            them in from what you said.
          </p>
        </div>

        <AddTemplateForm />

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Your templates {rows.length > 0 && `(${rows.length})`}
          </h2>
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-muted text-sm">
              No templates yet. Add one above and it&apos;ll show up on the
              record screen, ready to auto-fill.
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((t) => (
                <li
                  key={t.id}
                  className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-foreground">{t.name}</h3>
                    <form action={deleteTemplate}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-muted hover:text-danger transition"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted font-mono line-clamp-4">
                    {t.content}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
