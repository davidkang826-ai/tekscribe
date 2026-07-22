"use client";

import { useState } from "react";
import { deleteNote } from "@/lib/supabase/notes";

/** A small ✕ on an archive card that confirms, then deletes that one note. */
export default function DeleteNoteButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Delete note"
        className="tt-pop absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[15px] text-muted ring-1 ring-border shadow-sm hover:text-danger"
      >
        ✕
      </button>

      {confirming && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-surface/95 backdrop-blur-sm p-3 text-center">
          <p className="text-[15px] font-medium text-foreground">
            Delete this note?
          </p>
          <div className="flex gap-2">
            <form action={deleteNote}>
              <input type="hidden" name="id" value={id} />
              <button
                type="submit"
                className="tt-pop rounded-md bg-danger px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90 transition"
              >
                Delete
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="tt-pop rounded-md bg-surface px-3 py-1.5 text-[13px] font-medium text-foreground ring-1 ring-border hover:bg-slate-50 transition"
            >
              Keep
            </button>
          </div>
        </div>
      )}
    </>
  );
}
