import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses row-level security, so use it ONLY in
 * trusted server code with no user session, like the Stripe webhook (which
 * needs to write a subscription onto a profile it can't authenticate as).
 * Never import this into client code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client is not configured. Add SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
