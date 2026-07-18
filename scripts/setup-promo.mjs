// One-shot promo setup: TEKSCRIBESEATTLE2026 — 30 days of Pro free.
// Creates a $29-off-first-invoice coupon locked to the Pro product, then a
// promotion code that customers type at checkout. Expires end of August 2026
// (Pacific). Checkout already allows promo codes (allow_promotion_codes).
//
// The discount equals one month of Pro, so:
//   - Pro monthly: first month free
//   - Pro yearly:  $29 off the annual charge (not a free year)
//   - Team plans:  code doesn't apply (Pro product only)
//
// SAFETY: reads STRIPE_SECRET_KEY from .env.local, same as setup-stripe.mjs.
// Rehearse with your TEST key first if you like; run with the LIVE key to
// make the code real.
//
// Run:  node scripts/setup-promo.mjs

import Stripe from "stripe";
import { readFileSync, existsSync } from "node:fs";

const CODE = "TEKSCRIBESEATTLE2026";
// End of August 2026, 11:59:59pm Pacific.
const EXPIRES = Math.floor(new Date("2026-08-31T23:59:59-07:00").getTime() / 1000);
const AMOUNT_OFF = 2900; // one month of Pro, in cents

const ENV_PATH = ".env.local";
const env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
const getVar = (name) =>
  env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1].trim() ?? "";

const key = process.env.STRIPE_SECRET_KEY || getVar("STRIPE_SECRET_KEY");
if (!key) {
  console.error(
    "No STRIPE_SECRET_KEY found. Add it to .env.local first:\n  STRIPE_SECRET_KEY=sk_...\n"
  );
  process.exit(1);
}
const proPriceId =
  process.env.STRIPE_PRICE_PRO_MONTHLY || getVar("STRIPE_PRICE_PRO_MONTHLY");
if (!proPriceId) {
  console.error(
    "No STRIPE_PRICE_PRO_MONTHLY found in .env.local. Run scripts/setup-stripe.mjs first.\n"
  );
  process.exit(1);
}

const stripe = new Stripe(key);
const mode = key.startsWith("sk_live") ? "LIVE" : "TEST";
console.log(`\nPromo setup in ${mode} mode.\n`);

// Already exists? Leave it alone so re-runs are safe.
const existing = await stripe.promotionCodes.list({ code: CODE, limit: 1 });
if (existing.data[0]) {
  const p = existing.data[0];
  console.log(
    `  ${CODE} already exists (${p.id}, ${p.active ? "active" : "inactive"}). Nothing to do.`
  );
  process.exit(0);
}

// The coupon is locked to the Pro product so it can't discount Team.
const proPrice = await stripe.prices.retrieve(proPriceId);
const proProductId =
  typeof proPrice.product === "string" ? proPrice.product : proPrice.product.id;

const coupon = await stripe.coupons.create({
  name: "30 days of Pro free",
  amount_off: AMOUNT_OFF,
  currency: "usd",
  duration: "once",
  applies_to: { products: [proProductId] },
});

const promo = await stripe.promotionCodes.create({
  coupon: coupon.id,
  code: CODE,
  expires_at: EXPIRES,
});

console.log(`  Coupon created: ${coupon.id} ($${AMOUNT_OFF / 100} off, Pro only)`);
console.log(`  Promotion code: ${promo.code} (${promo.id})`);
console.log(
  `  Expires: ${new Date(EXPIRES * 1000).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "long",
    timeStyle: "short",
  })} Pacific\n`
);
console.log(
  "Done. Customers enter the code on the Stripe checkout page (\"Add promotion code\")."
);
