import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import ResetPasswordForm from "@/components/ResetPasswordForm";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo size={34} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground mb-1">
            Set a new password
          </h1>
          {user ? (
            <>
              <p className="text-sm text-muted mb-5">
                Choose a new password for your account.
              </p>
              <ResetPasswordForm />
            </>
          ) : (
            <p className="text-sm text-muted mt-2">
              This reset link is invalid or has expired.{" "}
              <Link href="/forgot-password" className="text-brand font-medium">
                Request a new one
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
