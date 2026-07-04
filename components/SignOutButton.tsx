"use client";

import { signOut } from "@/lib/supabase/actions";

export default function SignOutButton() {
  return (
    <form action={signOut} className="contents">
      <button
        type="submit"
        className="tt-pop cursor-pointer text-sm font-medium text-muted hover:text-foreground transition-colors leading-none"
      >
        Sign out
      </button>
    </form>
  );
}
