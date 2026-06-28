"use client";

import { signOut } from "@/lib/supabase/actions";

export default function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="text-xs font-medium text-muted hover:text-foreground transition"
      >
        Sign out
      </button>
    </form>
  );
}
