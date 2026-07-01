"use client";

import { signOut } from "@/lib/supabase/actions";

export default function SignOutButton() {
  return (
    <form action={signOut} className="flex items-center">
      <button
        type="submit"
        className="text-sm font-medium text-muted hover:text-foreground transition leading-none"
      >
        Sign out
      </button>
    </form>
  );
}
