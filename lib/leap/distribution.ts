import { normCdf, standardizedTPdf } from "./math.ts";
import type { OptionType } from "./types.ts";

// The engine's differentiated view of the world.
//
// The market prices an option as if the underlying's log-return is normal
// (thin tails). We instead model the terminal log-return with a *standardized
// Student-t* distribution: same volatility, fatter tails. That directly encodes
// the Cornwall Capital insight that large moves are more likely than the
// lognormal model assumes, so cheap out-of-the-money convexity is underpriced.
//
// We integrate the option payoff against this distribution with a deterministic
// grid (trapezoidal rule), so results are fully reproducible with no RNG.

export interface RealWorldModel {
  spot: number;
  vol: number; // realized volatility, annualized decimal
  years: number;
  drift: number; // assumed real-world annual drift, decimal
  dof: number; // Student-t degrees of freedom (fat-tail strength)
  riskFree: number; // for discounting the expected payoff
}

interface GridPoint {
  z: number; // standardized-t variable
  density: number; // pdf(z)
  price: number; // terminal underlying price at this z
}

function buildGrid(m: RealWorldModel): { points: GridPoint[]; dz: number } {
  const zMax = 12; // deep into both tails
  const steps = 4000;
  const dz = (2 * zMax) / steps;
  const sigmaT = m.vol * Math.sqrt(m.years);
  // Drift term of the log-return. The -0.5*sigma^2 keeps E[S_T] anchored near
  // the intended drift under the lognormal core.
  const meanLog = (m.drift - 0.5 * m.vol * m.vol) * m.years;
  const points: GridPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const z = -zMax + i * dz;
    const logRet = meanLog + sigmaT * z;
    points.push({
      z,
      density: standardizedTPdf(z, m.dof),
      price: m.spot * Math.exp(logRet),
    });
  }
  return { points, dz };
}

function integrate(points: GridPoint[], dz: number, f: (p: GridPoint) => number): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const w = i === 0 || i === points.length - 1 ? 0.5 : 1; // trapezoidal ends
    sum += w * f(points[i]) * points[i].density;
  }
  return sum * dz;
}

export interface ValuationResult {
  fairValue: number; // expected discounted payoff per share
  probProfit: number; // P(terminal payoff > premium), i.e. beyond breakeven
  probItm: number; // P(finish in the money)
}

// Expected discounted payoff of one option under the fat-tailed model, plus the
// real-world probabilities of profit and of finishing in the money.
export function valueUnderModel(
  type: OptionType,
  strike: number,
  premium: number,
  m: RealWorldModel,
): ValuationResult {
  const { points, dz } = buildGrid(m);
  const discount = Math.exp(-m.riskFree * m.years);

  const payoff = (price: number): number =>
    type === "call" ? Math.max(price - strike, 0) : Math.max(strike - price, 0);

  // Total probability mass on the grid, used to normalize away the tiny amount
  // of density beyond +/-zMax that the finite grid drops.
  const mass = integrate(points, dz, () => 1);
  const expPayoff = integrate(points, dz, (p) => payoff(p.price)) / mass;

  const breakeven = type === "call" ? strike + premium : strike - premium;
  const profitMass =
    integrate(points, dz, (p) =>
      type === "call" ? (p.price > breakeven ? 1 : 0) : p.price < breakeven ? 1 : 0,
    ) / mass;
  const itmMass =
    integrate(points, dz, (p) =>
      type === "call" ? (p.price > strike ? 1 : 0) : p.price < strike ? 1 : 0,
    ) / mass;

  return {
    fairValue: expPayoff * discount,
    probProfit: profitMass,
    probItm: itmMass,
  };
}

// Market-implied probability of finishing beyond breakeven under the lognormal
// (thin-tailed) model the option price embeds. Contrasting this with the
// fat-tailed probProfit is the mispricing "tail gap".
export function marketProbProfit(
  type: OptionType,
  strike: number,
  premium: number,
  spot: number,
  iv: number,
  years: number,
  drift: number,
): number {
  if (iv <= 0 || years <= 0) return 0;
  const breakeven = type === "call" ? strike + premium : strike - premium;
  if (breakeven <= 0) return type === "call" ? 1 : 0;
  const sigmaT = iv * Math.sqrt(years);
  const meanLog = Math.log(spot) + (drift - 0.5 * iv * iv) * years;
  const z = (Math.log(breakeven) - meanLog) / sigmaT;
  return type === "call" ? 1 - normCdf(z) : normCdf(z);
}
