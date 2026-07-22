"use client";

import { useActionState } from "react";
import { saveProfile, type AuthState } from "@/lib/supabase/actions";

export default function OnboardingForm({
  signupEmail,
}: {
  signupEmail: string;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    saveProfile,
    {}
  );

  return (
    <form action={formAction} className="space-y-3 text-left">
      {state.error && (
        <div className="rounded-lg bg-red-50 text-danger text-[15px] px-3 py-2.5 ring-1 ring-red-100">
          {state.error}
        </div>
      )}
      <div>
        <label className="block text-[13px] font-medium text-muted mb-1">
          Your name
        </label>
        <input
          name="display_name"
          type="text"
          placeholder="What customers call you, e.g. Johnny"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[17px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p className="mt-1 text-[13px] text-muted">
          We sign your customer messages with this. You can change it anytime.
        </p>
      </div>
      <div>
        <label className="block text-[13px] font-medium text-muted mb-1">
          Mobile phone
        </label>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="(617) 555-0123"
          required
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
          defaultValue={signupEmail}
          placeholder="you@example.com"
          required
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[17px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p className="mt-1 text-[13px] text-muted">
          We send customer emails for you. Replies come back to this address.
          Defaults to your sign-up email; change it if you&apos;d rather use a
          different one.
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-[15px] shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
      >
        {pending ? "Saving…" : "Finish setup"}
      </button>
    </form>
  );
}
