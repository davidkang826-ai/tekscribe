import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { planIdForPrice } from "@/lib/plans";

export const runtime = "nodejs";

// Stripe posts subscription lifecycle events here. We verify the signature,
// then write the plan onto the profile with the service-role client (there's
// no user session on a webhook). Configure the endpoint + secret in Stripe.
export async function POST(req: Request) {
  if (!isStripeConfigured) {
    return new Response("billing not configured", { status: 503 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("no webhook secret", { status: 503 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("no signature", { status: 400 });

  const body = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad signature";
    console.error("[stripe webhook] signature", message);
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.metadata?.userId || s.client_reference_id || null;
      if (userId) {
        await admin
          .from("profiles")
          .update({
            plan: s.metadata?.planId || "pro",
            plan_status: "active",
            plan_selected: true,
            // A paid subscription supersedes any promo trial.
            plan_expires_at: null,
            stripe_customer_id:
              typeof s.customer === "string" ? s.customer : s.customer?.id ?? null,
            stripe_subscription_id:
              typeof s.subscription === "string"
                ? s.subscription
                : s.subscription?.id ?? null,
          })
          .eq("id", userId);
      }
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const priceId = sub.items.data[0]?.price?.id;
      const deleted = event.type === "customer.subscription.deleted";
      const planId = deleted
        ? "free"
        : (priceId ? planIdForPrice(priceId) : null) ||
          sub.metadata?.planId ||
          "pro";
      await admin
        .from("profiles")
        .update({
          plan: planId,
          plan_status: deleted ? "canceled" : sub.status,
        })
        .eq("stripe_customer_id", customerId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "handler error";
    console.error("[stripe webhook] handler", message);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
