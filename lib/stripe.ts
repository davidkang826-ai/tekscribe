import Stripe from "stripe";

let client: Stripe | null = null;

/** True once the Stripe secret key is present, so billing stays inert until
 *  you configure it (the app keeps working on the Free tier meanwhile). */
export const isStripeConfigured = !!process.env.STRIPE_SECRET_KEY;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  if (!client) client = new Stripe(key);
  return client;
}
