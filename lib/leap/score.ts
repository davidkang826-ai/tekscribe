import { bsDelta, impliedVol, yearsToExpiry } from "./blackScholes.ts";
import { RISK_FREE_RATE, DIVIDEND_YIELD } from "./config.ts";
import {
  marketProbProfit,
  valueUnderModel,
  type RealWorldModel,
} from "./distribution.ts";
import { clamp, ramp } from "./math.ts";
import type {
  ContractAnalysis,
  OptionContract,
  ScenarioConfig,
  ScoreBreakdown,
  ScoredCandidate,
  ScreenConfig,
  UnderlyingSnapshot,
} from "./types.ts";

// Weights for the composite score. They sum to 1. The real-world EV edge
// carries the most weight because it is the most direct measure of "the market
// is charging less than this convexity is worth".
const WEIGHTS = {
  valueEdge: 0.4,
  cheapVol: 0.2,
  convexity: 0.2,
  tradeability: 0.15,
  tailGap: 0.05,
};

function mid(c: OptionContract): number {
  if (c.bid > 0 && c.ask > 0) return (c.bid + c.ask) / 2;
  return c.lastPrice > 0 ? c.lastPrice : Math.max(c.bid, c.ask, 0);
}

// The scenario move points in the option's profit direction: up for calls,
// down for puts. This keeps the convexity metric meaningful for both sides.
function scenarioTargetPrice(
  u: UnderlyingSnapshot,
  years: number,
  scenario: ScenarioConfig,
  type: OptionType,
): number {
  const up = type === "call";
  switch (scenario.kind) {
    case "fiftyTwoWeekHigh":
      // For puts this is the mirror case: an extreme move to the 52-week low.
      if (up) return u.high52w && u.high52w > u.price ? u.high52w : u.price * 1.5;
      return u.low52w && u.low52w < u.price ? u.low52w : u.price * 0.6;
    case "returnTo":
      return u.price * (scenario.fraction ?? (up ? 1.5 : 0.6));
    case "sigma":
    default: {
      const sigmas = scenario.sigmas ?? 2;
      const dir = up ? 1 : -1;
      return u.price * Math.exp(dir * sigmas * u.realizedVol * Math.sqrt(years));
    }
  }
}

// Build the full model read on one contract. Returns null if the contract has
// no usable price.
export function analyzeContract(
  contract: OptionContract,
  underlying: UnderlyingSnapshot,
  config: ScreenConfig,
  now: Date,
): ContractAnalysis | null {
  const price = mid(contract);
  if (price <= 0) return null;

  const s = underlying.price;
  const k = contract.strike;
  const t = yearsToExpiry(contract.expiry, now);
  if (t <= 0) return null;

  const iv =
    contract.impliedVolatility && contract.impliedVolatility > 0
      ? contract.impliedVolatility
      : impliedVol(contract.type, price, s, k, t, RISK_FREE_RATE, DIVIDEND_YIELD);

  const model: RealWorldModel = {
    spot: s,
    vol: underlying.realizedVol > 0 ? underlying.realizedVol : iv,
    years: t,
    drift: config.expectedDrift,
    dof: config.tailDof,
    riskFree: RISK_FREE_RATE,
  };
  const valuation = valueUnderModel(contract.type, k, price, model);
  const mkt = marketProbProfit(
    contract.type,
    k,
    price,
    s,
    iv,
    t,
    config.expectedDrift,
  );

  const scenarioPrice = scenarioTargetPrice(underlying, t, config.scenario, contract.type);
  const scenarioPayoff =
    contract.type === "call"
      ? Math.max(scenarioPrice - k, 0)
      : Math.max(k - scenarioPrice, 0);

  const breakeven =
    contract.type === "call" ? (k + price) / s - 1 : 1 - (k - price) / s;
  const spreadPct =
    contract.bid > 0 && contract.ask > 0
      ? (contract.ask - contract.bid) / mid(contract)
      : 1;

  return {
    price,
    contractCost: price * 100,
    impliedVol: iv,
    moneyness: k / s,
    breakevenPct: breakeven,
    delta: bsDelta(contract.type, s, k, t, iv, RISK_FREE_RATE, DIVIDEND_YIELD),
    fairValue: valuation.fairValue,
    edgeRatio: valuation.fairValue / price,
    probProfit: valuation.probProfit,
    marketProbProfit: mkt,
    tailGap: valuation.probProfit - mkt,
    scenarioPrice,
    targetMultiple: scenarioPayoff / price,
    spreadPct,
  };
}

function buildBreakdown(
  a: ContractAnalysis,
  u: UnderlyingSnapshot,
): ScoreBreakdown {
  // Value edge: fair value vs price. edgeRatio of 1 is fair, 3+ is a strong
  // mispricing. Scored on a log scale so a 10x edge does not swamp everything.
  const valueEdge = a.edgeRatio <= 1 ? 0 : ramp(Math.log(a.edgeRatio) / Math.log(3), 0, 1);

  // Cheap vol: implied cheap relative to how much the stock actually moves.
  // ivToRv < 1 means the option is priced for less movement than realized.
  const ivToRv = u.realizedVol > 0 ? a.impliedVol / u.realizedVol : 1;
  let cheapVol = ramp(1.3 - ivToRv, 0, 0.5); // 1.3 -> 0, 0.8 -> 1
  if (u.ivRank !== undefined) {
    cheapVol = 0.6 * cheapVol + 0.4 * (1 - clamp(u.ivRank, 0, 1));
  }

  // Convexity: how many multiples of the premium the scenario move returns.
  const convexity = ramp(Math.log(Math.max(a.targetMultiple, 1)) / Math.log(15), 0, 1);

  // Tradeability: tight spread and real open interest matter for a bet you can
  // actually enter and exit.
  const spreadScore = ramp(0.5 - a.spreadPct, 0, 0.5); // 0.5 -> 0, 0.0 -> 1
  const tradeability = spreadScore;

  // Tail gap: our fat-tailed profit odds vs the market's thin-tailed odds.
  const tailGap = ramp(a.tailGap, 0, 0.25);

  return { valueEdge, cheapVol, convexity, tradeability, tailGap };
}

function composite(b: ScoreBreakdown): number {
  return (
    100 *
    (WEIGHTS.valueEdge * b.valueEdge +
      WEIGHTS.cheapVol * b.cheapVol +
      WEIGHTS.convexity * b.convexity +
      WEIGHTS.tradeability * b.tradeability +
      WEIGHTS.tailGap * b.tailGap)
  );
}

function buildReasons(a: ContractAnalysis, u: UnderlyingSnapshot): string[] {
  const r: string[] = [];
  if (a.edgeRatio >= 1.5) {
    r.push(
      `Fat-tail fair value ${a.edgeRatio.toFixed(2)}x the ask (model sees the market underpricing large moves)`,
    );
  }
  const ivToRv = u.realizedVol > 0 ? a.impliedVol / u.realizedVol : 1;
  if (ivToRv < 1) {
    r.push(
      `Implied vol ${(a.impliedVol * 100).toFixed(0)}% is below realized ${(u.realizedVol * 100).toFixed(0)}%, so movement looks cheap`,
    );
  }
  if (a.targetMultiple >= 4) {
    r.push(
      `${a.targetMultiple.toFixed(1)}x payoff if the scenario move hits, for a capped ${a.contractCost.toFixed(0)} dollar premium`,
    );
  }
  if (a.tailGap >= 0.05) {
    r.push(
      `Fat-tail odds of profit ${(a.probProfit * 100).toFixed(0)}% vs market ${(a.marketProbProfit * 100).toFixed(0)}%`,
    );
  }
  return r;
}

// Score one contract end to end. Returns null if it fails a hard filter.
export function scoreContract(
  contract: OptionContract,
  underlying: UnderlyingSnapshot,
  config: ScreenConfig,
  now: Date,
): ScoredCandidate | null {
  const t = yearsToExpiry(contract.expiry, now);
  const days = t * 365;
  if (days < config.minExpiryDays || days > config.maxExpiryDays) return null;
  if (contract.openInterest < config.minOpenInterest) return null;

  // Interpret the moneyness window as a distance-out-of-the-money band so it
  // works symmetrically for both sides: for calls OTM is strike above spot, for
  // puts it is strike below spot.
  const moneyness = contract.strike / underlying.price;
  const otmFraction = contract.type === "call" ? moneyness - 1 : 1 - moneyness;
  const minOtm = config.minMoneyness - 1;
  const maxOtm = config.maxMoneyness - 1;
  if (otmFraction < minOtm || otmFraction > maxOtm) return null;

  const analysis = analyzeContract(contract, underlying, config, now);
  if (!analysis) return null;
  if (analysis.contractCost > config.totalBudgetUsd) return null; // must fit the cap
  if (analysis.spreadPct > config.maxSpreadPct) return null;

  const breakdown = buildBreakdown(analysis, underlying);
  const score = composite(breakdown);
  const reasons = buildReasons(analysis, underlying);

  return { contract, underlying, analysis, breakdown, score, reasons };
}
