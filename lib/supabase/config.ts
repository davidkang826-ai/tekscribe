/**
 * True when Supabase env vars are present. Used to gate auth so the app keeps
 * running (ungated) before the backend is configured, then enforces login once
 * the keys are added. Safe to import from both server and client code.
 */
export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
