"use client";

import { useActionState } from "react";
import { updateSettings, type AuthState } from "@/lib/supabase/actions";

export default function SettingsForm({
  displayName,
  replyTo,
  businessName,
}: {
  displayName: string;
  replyTo: string;
  businessName: string;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    updateSettings,
    {}
  );

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4"
    >
      {state.error && (
        <div className="rounded-lg bg-red-50 text-danger text-[15px] px-3 py-2.5 ring-1 ring-red-100">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="rounded-lg bg-green-50 text-success text-[15px] px-3 py-2.5 ring-1 ring-green-100">
          ✓ Saved
        </div>
      )}

      <div>
        <label className="block text-[13px] font-medium text-muted mb-1">
          Your name
        </label>
        <input
          name="display_name"
          type="text"
          defaultValue={displayName}
          placeholder="What customers call you, e.g. Johnny"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[17px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p className="mt-1 text-[13px] text-muted">
          Customer messages open with this, like &ldquo;Hi, it&apos;s Johnny.&rdquo;
        </p>
      </div>

      <div>
        <label className="block text-[13px] font-medium text-muted mb-1">
          Business name
        </label>
        <input
          name="business_name"
          type="text"
          defaultValue={businessName}
          placeholder="Blue Ridge Plumbing"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[17px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      <div>
        <label className="block text-[13px] font-medium text-muted mb-1">
          Customer replies go to
        </label>
        <input
          name="reply_to_email"
          type="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          defaultValue={replyTo}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[17px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p className="mt-1 text-[13px] text-muted">
          When a customer replies to an email you sent, it comes back here.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-[15px] shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
