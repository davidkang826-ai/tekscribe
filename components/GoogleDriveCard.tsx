"use client";

import { disconnectGoogleDrive } from "@/lib/google-actions";

export default function GoogleDriveCard({
  connected,
  email,
  configured,
}: {
  connected: boolean;
  email: string | null;
  configured: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
        Google Drive backup
      </div>

      {connected ? (
        <>
          <p className="mt-1 text-sm text-foreground">
            ✓ Connected{email ? ` as ${email}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted">
            Photos and files from each saved visit copy into a{" "}
            <span className="font-medium text-foreground">
              TekScribe Records
            </span>{" "}
            folder in your Drive, organized by customer.
          </p>
          <form action={disconnectGoogleDrive} className="mt-4">
            <button
              type="submit"
              className="tt-pop rounded-lg bg-surface px-4 py-2 text-sm font-medium text-foreground ring-1 ring-border hover:bg-slate-50 transition"
            >
              Disconnect
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            Keep your own copy of every visit&apos;s photos and files: they back
            up to a{" "}
            <span className="font-medium text-foreground">
              TekScribe Records
            </span>{" "}
            folder in your Google Drive, one folder per customer.
          </p>
          {configured ? (
            <a
              href="/api/google/connect"
              className="tt-pop mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 transition"
            >
              Connect Google Drive
            </a>
          ) : (
            <div className="mt-4 inline-block rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-muted">
              Coming soon
            </div>
          )}
        </>
      )}
    </div>
  );
}
