// Subscription plans. Display copy lives here; the real prices live in Stripe,
// referenced by the price IDs in the env vars below. Keep the dollar figures
// here in sync with what you set on those Stripe prices.

export type PlanId = "free" | "pro" | "team";
export type Billing = "monthly" | "yearly";

export type PlanTier = {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number; // shown when billed monthly
  priceYearly: number; // shown per month when billed yearly
  features: string[];
  highlighted?: boolean;
  notesPerMonth: number | null; // null = unlimited
  stripe: { monthly?: string; yearly?: string };
};

export const PLANS: PlanTier[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Try it on real jobs",
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      "10 notes a month",
      "Record, transcribe, and AI write-up",
      "Send to customers by email or text",
      "Photos and files on each visit",
      "30 days of history",
    ],
    notesPerMonth: 10,
    stripe: {},
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For the busy solo tech",
    priceMonthly: 29,
    priceYearly: 24,
    highlighted: true,
    features: [
      "Unlimited notes",
      "Unlimited, searchable history",
      "Works offline, finishes when you're back",
      "Everything in Free",
    ],
    notesPerMonth: null,
    stripe: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
    },
  },
  {
    id: "team",
    name: "Team",
    tagline: "For a small crew",
    priceMonthly: 59,
    priceYearly: 49,
    features: [
      "Everything in Pro, for up to 5 techs",
      "Shared customer directory",
      "Admin controls",
    ],
    notesPerMonth: null,
    stripe: {
      monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,
      yearly: process.env.STRIPE_PRICE_TEAM_YEARLY,
    },
  },
];

export function planById(id: string): PlanTier | undefined {
  return PLANS.find((p) => p.id === id);
}

/** Reverse a Stripe price ID back to a plan id, for the webhook. */
export function planIdForPrice(priceId: string): PlanId | null {
  for (const p of PLANS) {
    if (p.stripe.monthly === priceId || p.stripe.yearly === priceId) return p.id;
  }
  return null;
}

/** A client-safe view of a tier (no secret price IDs), for the plan chooser. */
export type PlanDisplay = Omit<PlanTier, "stripe"> & {
  buyableMonthly: boolean;
  buyableYearly: boolean;
};

export function planDisplays(): PlanDisplay[] {
  return PLANS.map(({ stripe, ...rest }) => ({
    ...rest,
    buyableMonthly: !!stripe.monthly,
    buyableYearly: !!stripe.yearly,
  }));
}
