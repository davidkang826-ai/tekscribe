"use client";

import { useState } from "react";
import { deleteAccount } from "@/lib/supabase/account";

export default function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const ready = confirmText.trim().toUpperCase() === "DELETE";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[15px] font-medium text-danger hover:underline"
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-danger/30 bg-red-50 p-4">
      <p className="text-[15px] font-semibold text-danger">Delete your account?</p>
      <p className="mt-1 text-[13px] leading-relaxed text-danger/90">
        This permanently deletes your account, every note, your customer list,
        and all photos and files, and cancels any subscription. It can&apos;t be
        undone.
      </p>
      <label className="mt-3 block text-[13px] font-medium text-danger/90">
        Type DELETE to confirm
      </label>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="DELETE"
        autoCapitalize="characters"
        className="mt-1 w-full rounded-lg border border-danger/40 bg-white px-3 py-2 text-[17px] focus:outline-none focus:ring-2 focus:ring-danger/30"
      />
      <div className="mt-3 flex gap-2">
        <form action={deleteAccount}>
          <button
            type="submit"
            disabled={!ready}
            className="tt-pop rounded-lg bg-danger px-4 py-2 text-[15px] font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition"
          >
            Delete my account
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmText("");
          }}
          className="tt-pop rounded-lg bg-surface px-4 py-2 text-[15px] font-medium text-foreground ring-1 ring-border hover:bg-slate-50 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
