// Pilot promo code. A tech enters this on the plan screen to unlock a paid
// plan for the trial, with no card and no Stripe. Everything is configurable
// via env so the code, the plan it grants, and the trial length can change
// without a redeploy.
//
//   PROMO_CODE    the code techs type in            (default "TEKSCRIBE2026")
//   PROMO_PLAN    the plan it grants                (default "pro")
//   PROMO_MONTHS  free months from redemption       (default 2)

export const PROMO_CODE = (process.env.PROMO_CODE || "TEKSCRIBE2026").trim();
export const PROMO_PLAN = (process.env.PROMO_PLAN || "pro").trim();
export const PROMO_MONTHS = Number(process.env.PROMO_MONTHS || "2") || 2;

/** Case- and whitespace-insensitive match against the configured code. */
export function promoMatches(input: string): boolean {
  const code = input.trim().toLowerCase();
  return code.length > 0 && code === PROMO_CODE.toLowerCase();
}

/** When a redemption happening now should expire: PROMO_MONTHS out, so each
 *  tech gets a full trial no matter when they join the pilot. */
export function promoExpiry(from = new Date()): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + PROMO_MONTHS);
  return d;
}
