import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isStripeConfigured) {
    return Response.json({ error: "Billing isn't set up yet." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!prof?.stripe_customer_id) {
    return Response.json(
      { error: "No billing account yet. Pick a paid plan first." },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe();
    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://tekscribe.io";
    const session = await stripe.billingPortal.sessions.create({
      customer: prof.stripe_customer_id,
      return_url: `${origin}/settings`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't open billing.";
    console.error("[portal]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
