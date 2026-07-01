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
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="text-sm font-medium text-muted hover:text-foreground transition leading-none"
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
          <p className="mt-1 text-sm text-muted">
            The forms you fill out by hand — work orders, invoices, inspections.
            Add one, and TekScribe fills it in from what you say on the job.
          </p>
        </div>

        <AddTemplateForm />

        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Your templates{" "}
            {rows.length > 0 && (
              <span className="font-normal text-muted">({rows.length})</span>
            )}
          </h2>
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-muted text-sm">
              No templates yet. Add one above and it&apos;ll show up on the
              record screen, ready to auto-fill.
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:gap-4">
              {rows.map((t) => (
                <li key={t.id} className="relative pt-1.5">
                  {/* Clip tab — makes each card read as a little clipboard */}
                  <span className="absolute top-0 left-1/2 z-10 h-3 w-10 -translate-x-1/2 rounded-md bg-brand" />
                  <div className="relative flex min-h-[112px] flex-col items-center justify-center rounded-2xl border-2 border-border bg-surface px-3 pt-6 pb-4 text-center shadow-sm transition hover:border-brand/50 hover:shadow">
                    <h3 className="text-sm font-semibold leading-snug text-foreground break-words">
                      {t.name}
                    </h3>
                    <form
                      action={deleteTemplate}
                      className="absolute right-1.5 top-1.5"
                    >
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        aria-label="Delete template"
                        className="text-sm leading-none text-muted hover:text-danger transition"
                      >
                        ✕
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
