import { scoreContract } from "./score.ts";
import type {
  Allocation,
  OptionsDataProvider,
  ScoredCandidate,
  ScreenConfig,
} from "./types.ts";

export interface ScreenResult {
  candidates: ScoredCandidate[]; // ranked, best first
  scanned: number; // contracts examined
  errors: { symbol: string; message: string }[];
}

// Run the screen across a universe of tickers. Failures on any one symbol are
// collected rather than fatal, so a flaky feed does not sink the whole run.
export async function screenUniverse(
  provider: OptionsDataProvider,
  universe: string[],
  config: ScreenConfig,
  now: Date,
): Promise<ScreenResult> {
  const candidates: ScoredCandidate[] = [];
  const errors: { symbol: string; message: string }[] = [];
  let scanned = 0;

  for (const symbol of universe) {
    try {
      const underlying = await provider.getUnderlying(symbol);
      for (const type of config.types) {
        const chain = await provider.getLeapChain(symbol, type);
        for (const contract of chain) {
          scanned++;
          const scored = scoreContract(contract, underlying, config, now);
          if (scored) candidates.push(scored);
        }
      }
    } catch (err) {
      errors.push({
        symbol,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return { candidates, scanned, errors };
}

// Greedy, diversified sizing within the total budget: take the best-scored
// candidate from each distinct underlying, one contract at a time, until the
// cap is reached. One name per contract keeps the small book from doubling down.
export function allocateBudget(
  candidates: ScoredCandidate[],
  totalBudgetUsd: number,
): Allocation[] {
  const allocations: Allocation[] = [];
  const usedSymbols = new Set<string>();
  let remaining = totalBudgetUsd;

  for (const candidate of candidates) {
    const symbol = candidate.contract.symbol;
    if (usedSymbols.has(symbol)) continue;
    const cost = candidate.analysis.contractCost;
    if (cost > remaining) continue;
    allocations.push({ candidate, quantity: 1, cost });
    usedSymbols.add(symbol);
    remaining -= cost;
  }

  return allocations;
}
