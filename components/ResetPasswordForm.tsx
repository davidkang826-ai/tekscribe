"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/lib/supabase/actions";

export default function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    updatePassword,
    {}
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error && (
        <div className="rounded-lg bg-red-50 text-danger text-sm px-3 py-2.5 ring-1 ring-red-100">
          {state.error}
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          New password
        </label>
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          Confirm new password
        </label>
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Type it again"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
      >
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
