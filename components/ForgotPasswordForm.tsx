"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  requestPasswordReset,
  resetPasswordWithCode,
  type AuthState,
} from "@/lib/supabase/actions";

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[17px] focus:outline-none focus:ring-2 focus:ring-brand/30";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");

  // Stage 1: send the code.
  const [reqState, reqAction, reqPending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    {}
  );
  // Stage 2: verify the code and set the new password.
  const [resetState, resetAction, resetPending] = useActionState<
    AuthState,
    FormData
  >(resetPasswordWithCode, {});

  // Once the code is sent, show the code + new-password form.
  if (reqState.ok) {
    return (
      <form action={resetAction} className="space-y-3">
        {resetState.error && (
          <div className="rounded-lg bg-red-50 text-danger text-[15px] px-3 py-2.5 ring-1 ring-red-100">
            {resetState.error}
          </div>
        )}
        <p className="text-[15px] text-muted">
          We sent a code to{" "}
          <span className="font-medium text-foreground">{email}</span>. Enter it
          below with your new password. (Check spam if you don&apos;t see it.)
        </p>
        <input type="hidden" name="email" value={email} />
        <div>
          <label className="block text-[13px] font-medium text-muted mb-1">
            Code from your email
          </label>
          <input
            name="token"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            required
            placeholder="Enter the code"
            className={`${inputClass} tracking-[0.3em] text-center text-lg`}
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-muted mb-1">
            New password
          </label>
          <input
            name="password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-muted mb-1">
            Confirm new password
          </label>
          <input
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Type it again"
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={resetPending}
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-[15px] shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
        >
          {resetPending ? "Saving…" : "Reset password"}
        </button>
        <p className="text-center text-[15px] text-muted">
          Didn&apos;t get a code?{" "}
          <Link href="/forgot-password" className="text-brand font-medium">
            Start over
          </Link>
        </p>
      </form>
    );
  }

  // Stage 1: ask for the email.
  return (
    <form action={reqAction} className="space-y-3">
      {reqState.error && (
        <div className="rounded-lg bg-red-50 text-danger text-[15px] px-3 py-2.5 ring-1 ring-red-100">
          {reqState.error}
        </div>
      )}
      <div>
        <label className="block text-[13px] font-medium text-muted mb-1">Email</label>
        <input
          name="email"
          type="email"
          required
          autoCapitalize="off"
          autoCorrect="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={reqPending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-[15px] shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
      >
        {reqPending ? "Sending…" : "Send code"}
      </button>
      <p className="text-center text-[15px] text-muted">
        <Link href="/login" className="text-brand font-medium">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
