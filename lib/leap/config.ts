import type { ScreenConfig } from "./types.ts";

// Continuous risk-free rate used for discounting and the implied-vol solve.
// Adjust to the prevailing short rate if you like; it is a minor input.
export const RISK_FREE_RATE = 0.04;

// Assumed continuous dividend yield for the underlying. Kept at zero by default
// (most cheap-convexity targets are low- or no-yield names); override per name
// if you extend the providers to supply it.
export const DIVIDEND_YIELD = 0.0;

// A starter universe of liquid, optionable names with active LEAP chains. This
// is deliberately broad and boring: Cornwall-style edges show up where the
// crowd is complacent, so the screen, not the watchlist, does the selecting.
export const DEFAULT_UNIVERSE = [
  "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA", "AMD", "INTC", "NFLX",
  "DIS", "BA", "F", "GM", "PLTR", "SOFI", "COIN", "UBER", "SNAP", "PYPL",
  "T", "KO", "PFE", "XOM", "WMT", "JPM", "BAC", "C", "GE", "MU",
];

export const DEFAULT_CONFIG: ScreenConfig = {
  totalBudgetUsd: 200,
  types: ["call"],
  minExpiryDays: 270, // roughly 9 months, LEAP-range and longer
  maxExpiryDays: 900, // out to ~2.5 years
  minOpenInterest: 50,
  maxSpreadPct: 0.5,
  minMoneyness: 1.0, // at or out of the money for calls
  maxMoneyness: 2.0, // not so far out it is a lottery ticket with no chain data
  tailDof: 4, // fat but finite-variance tails
  expectedDrift: 0.03, // conservative real-world drift assumption
  scenario: { kind: "sigma", sigmas: 2 },
};
