// Domain types for the LEAP asymmetry screener.

export type OptionType = "call" | "put";

// A single option contract as returned by a data provider.
export interface OptionContract {
  symbol: string; // underlying ticker, e.g. "AAPL"
  type: OptionType;
  strike: number;
  expiry: string; // ISO date, e.g. "2027-01-15"
  bid: number;
  ask: number;
  lastPrice: number;
  openInterest: number;
  volume: number;
  // Provider-supplied implied volatility (annualized, decimal). May be absent,
  // in which case the engine solves for it from the mid price.
  impliedVolatility?: number;
}

// A snapshot of the underlying stock the options are written on.
export interface UnderlyingSnapshot {
  symbol: string;
  price: number;
  // Annualized realized (historical) volatility, decimal. This is the engine's
  // estimate of how much the stock actually moves, independent of option prices.
  realizedVol: number;
  // Optional context used for scenario targets and cheap-vol signals.
  high52w?: number;
  low52w?: number;
  // Where current implied vol sits in its own 1y range, 0..1. Optional because
  // free feeds rarely expose it cleanly.
  ivRank?: number;
}

// Everything a data source must supply. Swap implementations (mock, Yahoo,
// Polygon, Tradier) without touching the scoring engine.
export interface OptionsDataProvider {
  name: string;
  getUnderlying(symbol: string): Promise<UnderlyingSnapshot>;
  // Long-dated contracts only; providers should return LEAP-range expiries.
  getLeapChain(symbol: string, type: OptionType): Promise<OptionContract[]>;
}

// Tunable parameters for the model and the filters.
export interface ScreenConfig {
  totalBudgetUsd: number; // hard cap on capital deployed, e.g. 200
  types: OptionType[]; // which sides to screen, default ["call"]
  minExpiryDays: number; // LEAP floor, e.g. 270
  maxExpiryDays: number; // upper bound, e.g. 900
  minOpenInterest: number;
  maxSpreadPct: number; // (ask-bid)/mid ceiling, e.g. 0.5
  // Moneyness window relative to spot. For calls, 1.0 means "at or out of the
  // money". Cornwall-style bets live in cheap OTM territory.
  minMoneyness: number;
  maxMoneyness: number;
  // Fat-tail model parameters.
  tailDof: number; // Student-t degrees of freedom; lower = fatter tails
  expectedDrift: number; // assumed real-world annual drift, decimal
  // Scenario target for the convexity/multiple metric.
  scenario: ScenarioConfig;
}

export type ScenarioKind = "sigma" | "fiftyTwoWeekHigh" | "returnTo";

export interface ScenarioConfig {
  kind: ScenarioKind;
  // For "sigma": how many realized-vol standard deviations the move is.
  sigmas?: number;
  // For "returnTo": absolute target price fraction of spot, e.g. 1.5 = +50%.
  fraction?: number;
}

// The model's read on a single contract.
export interface ContractAnalysis {
  price: number; // mid used for costing, per share
  contractCost: number; // price * 100
  impliedVol: number;
  moneyness: number; // strike / spot
  breakevenPct: number; // move to breakeven at expiry, decimal
  delta: number;
  // Real-world (fat-tailed) valuation.
  fairValue: number; // expected discounted payoff under the model
  edgeRatio: number; // fairValue / price
  probProfit: number; // P(finish beyond breakeven) under the model
  marketProbProfit: number; // same, under market-implied lognormal
  tailGap: number; // probProfit - marketProbProfit
  // Convexity scenario.
  scenarioPrice: number;
  targetMultiple: number; // payoff at scenario / price
  // Liquidity.
  spreadPct: number;
}

export interface ScoreBreakdown {
  valueEdge: number; // 0..1
  cheapVol: number;
  convexity: number;
  tradeability: number;
  tailGap: number;
}

export interface ScoredCandidate {
  contract: OptionContract;
  underlying: UnderlyingSnapshot;
  analysis: ContractAnalysis;
  breakdown: ScoreBreakdown;
  score: number; // 0..100 composite
  reasons: string[]; // plain-language why-it-scored notes
}

// A sized paper allocation produced from ranked candidates within budget.
export interface Allocation {
  candidate: ScoredCandidate;
  quantity: number; // number of contracts
  cost: number; // quantity * contractCost
}
