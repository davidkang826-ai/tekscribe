"use client";

import { disconnectGoogleDrive } from "@/lib/google-actions";
import { GoogleDriveLogo } from "./GoogleDriveLogo";

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
      <div className="flex items-center gap-2.5">
        <GoogleDriveLogo size={20} />
        <h3 className="text-[15px] font-semibold text-foreground">
          Google Drive backup
        </h3>
        {connected && (
          <span className="ml-auto rounded-full bg-green-50 px-2.5 py-0.5 text-[12px] font-semibold text-success ring-1 ring-green-100">
            Connected
          </span>
        )}
      </div>

      {connected ? (
        <>
          <p className="mt-3 text-[15px] text-foreground">
            {email ? (
              <>
                Backing up to{" "}
                <span className="font-medium">{email}</span>
              </>
            ) : (
              "Backing up your saved visits."
            )}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Photos and files from each visit land in a TekScribe Records folder
            in your Drive, organized by customer.
          </p>
          <form action={disconnectGoogleDrive} className="mt-4">
            <button
              type="submit"
              className="text-[13px] font-medium text-muted hover:text-foreground transition"
            >
              Disconnect
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Keep your own copy of every visit&apos;s photos and files in a
            TekScribe Records folder in your Drive, one folder per customer.
          </p>
          {configured ? (
            <a
              href="/api/google/connect"
              className="tt-pop mt-4 inline-flex items-center gap-2.5 rounded-lg bg-surface px-4 py-2.5 text-[15px] font-medium text-foreground ring-1 ring-border shadow-sm hover:bg-slate-50 transition"
            >
              <GoogleDriveLogo size={18} />
              Connect Google Drive
            </a>
          ) : (
            <div className="mt-4 inline-block rounded-lg bg-slate-100 px-4 py-2 text-[15px] font-medium text-muted">
              Coming soon
            </div>
          )}
        </>
      )}
    </div>
  );
}
