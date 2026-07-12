// One-shot Stripe setup: creates the Pro + Team products and their monthly /
// yearly prices, plus the production webhook, then writes the resulting IDs and
// webhook signing secret into .env.local.
//
// SAFETY:
//   - Put your Stripe secret key in .env.local as STRIPE_SECRET_KEY=sk_...
//   - Never paste the key into chat. This script reads it from .env.local only.
//   - The key and the webhook secret are never printed to the screen.
//
// Run:  node scripts/setup-stripe.mjs
// Tip:  use your TEST key first (sk_test_...) to rehearse, then the live key.

import Stripe from "stripe";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ENV_PATH = ".env.local";

function readEnvFile() {
  return existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
}

function getVar(contents, name) {
  const m = contents.match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
}

function upsertVars(contents, vars) {
  let out = contents;
  for (const [k, v] of Object.entries(vars)) {
    if (new RegExp(`^${k}=.*$`, "m").test(out)) {
      out = out.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`);
    } else {
      out += (out.endsWith("\n") || out === "" ? "" : "\n") + `${k}=${v}\n`;
    }
  }
  return out.endsWith("\n") ? out : out + "\n";
}

const env = readEnvFile();
const key = process.env.STRIPE_SECRET_KEY || getVar(env, "STRIPE_SECRET_KEY");
if (!key) {
  console.error(
    "No STRIPE_SECRET_KEY found. Add it to .env.local first:\n  STRIPE_SECRET_KEY=sk_test_...\n"
  );
  process.exit(1);
}

const stripe = new Stripe(key);
const mode = key.startsWith("sk_live") ? "LIVE" : "TEST";
const siteUrl = process.env.SITE_URL || "https://tekscribe.io";
const webhookUrl = `${siteUrl}/api/stripe/webhook`;

// Amounts in cents. Yearly is the full annual charge (shown as $/mo in the app).
const PLANS = [
  { key: "PRO", name: "TekScribe Pro", monthly: 2900, yearly: 28800 },
  { key: "TEAM", name: "TekScribe Team", monthly: 5900, yearly: 58800 },
];

console.log(`\nStripe setup in ${mode} mode. Webhook target: ${webhookUrl}\n`);

const results = {};

for (const p of PLANS) {
  const product = await stripe.products.create({ name: p.name });
  const monthly = await stripe.prices.create({
    product: product.id,
    unit_amount: p.monthly,
    currency: "usd",
    recurring: { interval: "month" },
  });
  const yearly = await stripe.prices.create({
    product: product.id,
    unit_amount: p.yearly,
    currency: "usd",
    recurring: { interval: "year" },
  });
  results[`STRIPE_PRICE_${p.key}_MONTHLY`] = monthly.id;
  results[`STRIPE_PRICE_${p.key}_YEARLY`] = yearly.id;
  console.log(
    `  ${p.name}: monthly ${monthly.id} ($${p.monthly / 100}), yearly ${yearly.id} ($${p.yearly / 100}/yr)`
  );
}

// Webhook: reuse an existing endpoint for this URL if present (its secret can't
// be re-read, so we don't overwrite it), otherwise create one.
const existing = await stripe.webhookEndpoints.list({ limit: 100 });
const already = existing.data.find((w) => w.url === webhookUrl);
if (already) {
  console.log(
    `\n  Webhook for ${webhookUrl} already exists (${already.id}). Leaving it as-is.`
  );
  console.log(
    "  If STRIPE_WEBHOOK_SECRET isn't set, roll its signing secret in the Stripe dashboard and paste it into .env.local."
  );
} else {
  const wh = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: [
      "checkout.session.completed",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ],
  });
  results["STRIPE_WEBHOOK_SECRET"] = wh.secret;
  console.log(`\n  Webhook created: ${wh.id} (secret saved to .env.local)`);
}

writeFileSync(ENV_PATH, upsertVars(env, results));

console.log(`\nDone. Wrote ${Object.keys(results).length} values to .env.local.`);
console.log(
  "Price IDs are safe to share; the webhook secret is not (it stays in .env.local).\n"
);
console.log("Next: copy these same vars into Vercel (Production) and redeploy.");
