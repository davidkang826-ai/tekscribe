"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

/** "Not interested" hides the prompt on this device for ~6 months. */
const SNOOZE_KEY = "tekscribe.drive-prompt-snooze-until";
const SNOOZE_MS = 183 * 24 * 60 * 60 * 1000; // ~6 months

// Tiny store over localStorage so the prompt is hydration-safe: hidden on the
// server render, shown after hydration unless snoozed, and hidden again the
// moment "Not interested" writes the snooze.
let listeners: Array<() => void> = [];
function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
function readSnoozed(): boolean {
  try {
    return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0);
  } catch {
    // Storage blocked (private mode etc.) — show it; worst case they
    // dismiss it again next visit.
    return false;
  }
}
function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    // Can't persist; hide via the session fallback below.
    sessionSnoozed = true;
  }
  listeners.forEach((l) => l());
}
let sessionSnoozed = false;

/**
 * First-run nudge to connect Google Drive backup. The home page renders it
 * only while Drive is configured but not yet connected; once the user
 * connects, it never appears again.
 */
export default function DriveBackupPrompt() {
  const snoozed = useSyncExternalStore(
    subscribe,
    () => sessionSnoozed || readSnoozed(),
    () => true // server snapshot: hidden until hydrated
  );

  if (snoozed) return null;

  return (
    <div className="tt-fade-in fixed inset-x-0 bottom-20 z-30 px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="tt-elevate mx-auto max-w-md rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50">
            {/* Google Drive mark */}
            <svg viewBox="0 0 87.3 78" width="22" height="20" aria-hidden="true">
              <path
                d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z"
                fill="#0066da"
              />
              <path
                d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"
                fill="#00ac47"
              />
              <path
                d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z"
                fill="#ea4335"
              />
              <path
                d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z"
                fill="#00832d"
              />
              <path
                d="M59.85 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
                fill="#2684fc"
              />
              <path
                d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
                fill="#ffba00"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              Back up your visits to Google Drive
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">
              Everything you upload and note — photos, files, reports — is kept
              in your own Drive, organized in one folder per customer.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Link
            href="/settings"
            className="flex-1 rounded-lg bg-brand px-4 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition"
          >
            Set it up
          </Link>
          <button
            type="button"
            onClick={snooze}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-muted ring-1 ring-border hover:bg-slate-50 hover:text-foreground transition"
          >
            Not interested
          </button>
        </div>
      </div>
    </div>
  );
}
