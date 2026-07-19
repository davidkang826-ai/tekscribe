import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { planById } from "@/lib/plans";

export const runtime = "nodejs";

function siteOrigin(req: Request) {
  return (
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://tekscribe.io"
  );
}

export async function POST(req: Request) {
  if (!isStripeConfigured) {
    return Response.json({ error: "Billing isn't set up yet." }, { status: 503 });
  }

  const { planId, billing } = (await req.json().catch(() => ({}))) as {
    planId?: string;
    billing?: string;
  };
  const plan = planId ? planById(planId) : undefined;
  if (!plan || plan.id === "free") {
    return Response.json({ error: "Pick a paid plan." }, { status: 400 });
  }
  const priceId = billing === "yearly" ? plan.stripe.yearly : plan.stripe.monthly;
  if (!priceId) {
    return Response.json(
      { error: "That plan isn't available yet." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  // They've now seen the plan screen, so don't force them back to it.
  await supabase
    .from("profiles")
    .update({ plan_selected: true })
    .eq("id", user.id);

  const { data: prof } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  try {
    const stripe = getStripe();
    const origin = siteOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: prof?.stripe_customer_id || undefined,
      customer_email: prof?.stripe_customer_id ? undefined : user.email || undefined,
      client_reference_id: user.id,
      metadata: { userId: user.id, planId: plan.id },
      subscription_data: { metadata: { userId: user.id, planId: plan.id } },
      allow_promotion_codes: true,
      success_url: `${origin}/plans?success=1&plan=${plan.id}`,
      cancel_url: `${origin}/plans?canceled=1`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't start checkout.";
    console.error("[checkout]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
