"use client";

import { useState } from "react";
import { deleteTemplate } from "@/lib/supabase/templates";

export default function DeleteTemplateButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${name}`}
        className="tt-pop absolute right-1.5 top-1.5 z-20 text-sm leading-none text-muted hover:text-danger transition-colors"
      >
        ✕
      </button>

      {confirming && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-surface/95 backdrop-blur-sm p-3 text-center">
          <p className="text-xs font-medium text-foreground leading-snug">
            Delete this template?
          </p>
          <div className="flex gap-2">
            <form action={deleteTemplate}>
              <input type="hidden" name="id" value={id} />
              <button
                type="submit"
                className="tt-pop rounded-md bg-danger px-3 py-1.5 text-white text-xs font-medium hover:opacity-90 transition"
              >
                Delete
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="tt-pop rounded-md bg-surface px-3 py-1.5 text-foreground text-xs font-medium ring-1 ring-border hover:bg-slate-50 transition"
            >
              Go back
            </button>
          </div>
        </div>
      )}
    </>
  );
}
