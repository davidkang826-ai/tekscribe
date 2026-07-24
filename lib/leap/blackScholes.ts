import { normCdf, normPdf } from "./math.ts";
import type { OptionType } from "./types.ts";

const DAYS_PER_YEAR = 365;

export function yearsToExpiry(expiryIso: string, now: Date): number {
  const expiry = new Date(expiryIso + "T00:00:00Z").getTime();
  const days = (expiry - now.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(days, 0) / DAYS_PER_YEAR;
}

// Standard Black-Scholes-Merton price with continuous risk-free rate r and
// dividend yield q. Used for the implied-vol solve and market-implied
// probabilities, not for the fat-tailed valuation.
export function bsPrice(
  type: OptionType,
  s: number,
  k: number,
  t: number,
  vol: number,
  r: number,
  q: number,
): number {
  if (t <= 0 || vol <= 0) {
    const intrinsic = type === "call" ? Math.max(s - k, 0) : Math.max(k - s, 0);
    return intrinsic;
  }
  const d1 =
    (Math.log(s / k) + (r - q + 0.5 * vol * vol) * t) / (vol * Math.sqrt(t));
  const d2 = d1 - vol * Math.sqrt(t);
  if (type === "call") {
    return s * Math.exp(-q * t) * normCdf(d1) - k * Math.exp(-r * t) * normCdf(d2);
  }
  return k * Math.exp(-r * t) * normCdf(-d2) - s * Math.exp(-q * t) * normCdf(-d1);
}

export function bsDelta(
  type: OptionType,
  s: number,
  k: number,
  t: number,
  vol: number,
  r: number,
  q: number,
): number {
  if (t <= 0 || vol <= 0) return type === "call" ? (s > k ? 1 : 0) : s < k ? -1 : 0;
  const d1 =
    (Math.log(s / k) + (r - q + 0.5 * vol * vol) * t) / (vol * Math.sqrt(t));
  return type === "call" ? Math.exp(-q * t) * normCdf(d1) : Math.exp(-q * t) * (normCdf(d1) - 1);
}

// Solve implied volatility from a market price. Newton-Raphson with a bisection
// fallback so it stays robust on deep OTM contracts where vega is tiny.
export function impliedVol(
  type: OptionType,
  price: number,
  s: number,
  k: number,
  t: number,
  r: number,
  q: number,
): number {
  const intrinsic = type === "call" ? Math.max(s - k, 0) : Math.max(k - s, 0);
  if (price <= intrinsic + 1e-6 || t <= 0) return 0;

  let vol = 0.5;
  for (let i = 0; i < 40; i++) {
    const model = bsPrice(type, s, k, t, vol, r, q);
    const sqrtT = Math.sqrt(t);
    const d1 = (Math.log(s / k) + (r - q + 0.5 * vol * vol) * t) / (vol * sqrtT);
    const vega = s * Math.exp(-q * t) * normPdf(d1) * sqrtT;
    const diff = model - price;
    if (Math.abs(diff) < 1e-6) return vol;
    if (vega < 1e-8) break;
    vol = vol - diff / vega;
    if (vol <= 0 || vol > 8 || Number.isNaN(vol)) break;
  }

  // Bisection fallback across a wide bracket.
  let lo = 1e-4;
  let hi = 8;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    const model = bsPrice(type, s, k, t, mid, r, q);
    if (model > price) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}
