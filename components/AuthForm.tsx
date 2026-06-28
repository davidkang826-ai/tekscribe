"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import type { AuthState } from "@/lib/supabase/actions";

type Action = (prev: AuthState, formData: FormData) => Promise<AuthState>;

export default function AuthForm({
  mode,
  action,
  notice,
}: {
  mode: "login" | "signup";
  action: Action;
  notice?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isSignup = mode === "signup";

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo size={34} />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground mb-1">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-muted mb-5">
            {isSignup
              ? "Start turning voice notes into customer updates."
              : "Sign in to your TechTalk account."}
          </p>

          {notice && (
            <div className="mb-4 rounded-lg bg-brand-50 text-brand text-sm px-3 py-2.5">
              {notice}
            </div>
          )}
          {state.error && (
            <div className="mb-4 rounded-lg bg-red-50 text-danger text-sm px-3 py-2.5 ring-1 ring-red-100">
              {state.error}
            </div>
          )}

          <form action={formAction} className="space-y-3">
            {isSignup && (
              <Field
                label="Business name (optional)"
                name="business_name"
                type="text"
                placeholder="Mike's Plumbing"
              />
            )}
            <Field
              label="Email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
            />
            <Field
              label="Password"
              name="password"
              type="password"
              placeholder={isSignup ? "At least 8 characters" : "Your password"}
              required
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
            >
              {pending
                ? "Please wait…"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-muted mt-5">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-brand font-medium">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New to TechTalk?{" "}
              <Link href="/signup" className="text-brand font-medium">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        autoCapitalize="off"
        autoCorrect="off"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
    </div>
  );
}
