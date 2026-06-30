"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthState } from "@/lib/supabase/actions";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    {}
  );

  if (state.ok) {
    return (
      <div className="rounded-lg bg-brand-50 text-brand text-sm px-4 py-3">
        If an account exists for that email, we&apos;ve sent a password reset
        link. Check your inbox (and spam).
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error && (
        <div className="rounded-lg bg-red-50 text-danger text-sm px-3 py-2.5 ring-1 ring-red-100">
          {state.error}
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-muted mb-1">Email</label>
        <input
          name="email"
          type="email"
          required
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="you@example.com"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-brand font-medium">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
