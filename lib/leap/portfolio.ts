import { promises as fs } from "node:fs";
import path from "node:path";
import type { Allocation, OptionType } from "./types.ts";

// A paper (simulated) portfolio persisted as JSON. No real money, no broker.
// Default location is .data/leap/portfolio.json, which is gitignored.

export interface PaperPosition {
  id: string;
  symbol: string;
  type: OptionType;
  strike: number;
  expiry: string;
  quantity: number; // contracts
  entryPrice: number; // per share
  entryCost: number; // quantity * entryPrice * 100
  openedAt: string; // ISO datetime
  scoreAtEntry: number;
  thesis: string;
}

export interface PaperPortfolio {
  startingCapital: number;
  cash: number;
  positions: PaperPosition[];
  closed: ClosedPosition[];
}

export interface ClosedPosition extends PaperPosition {
  exitPrice: number;
  exitValue: number;
  closedAt: string;
  pnl: number;
}

const DEFAULT_PATH = path.join(process.cwd(), ".data", "leap", "portfolio.json");

export async function loadPortfolio(
  startingCapital: number,
  file: string = DEFAULT_PATH,
): Promise<PaperPortfolio> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as PaperPortfolio;
  } catch {
    return { startingCapital, cash: startingCapital, positions: [], closed: [] };
  }
}

export async function savePortfolio(
  portfolio: PaperPortfolio,
  file: string = DEFAULT_PATH,
): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(portfolio, null, 2), "utf8");
}

function positionId(a: Allocation, now: Date): string {
  const c = a.candidate.contract;
  return `${c.symbol}-${c.type}-${c.strike}-${c.expiry}-${now.getTime()}`;
}

// Open paper positions from a set of budget allocations, debiting simulated
// cash. Skips anything the remaining cash cannot cover.
export function openPositions(
  portfolio: PaperPortfolio,
  allocations: Allocation[],
  now: Date,
): PaperPosition[] {
  const opened: PaperPosition[] = [];
  for (const a of allocations) {
    if (a.cost > portfolio.cash) continue;
    const c = a.candidate.contract;
    const pos: PaperPosition = {
      id: positionId(a, now),
      symbol: c.symbol,
      type: c.type,
      strike: c.strike,
      expiry: c.expiry,
      quantity: a.quantity,
      entryPrice: a.candidate.analysis.price,
      entryCost: a.cost,
      openedAt: now.toISOString(),
      scoreAtEntry: a.candidate.score,
      thesis: a.candidate.reasons[0] ?? "Cheap-convexity LEAP",
    };
    portfolio.cash -= a.cost;
    portfolio.positions.push(pos);
    opened.push(pos);
  }
  return opened;
}

export interface MarkedPosition extends PaperPosition {
  markPrice: number; // current per-share mid
  marketValue: number; // markPrice * quantity * 100
  pnl: number; // marketValue - entryCost
  pnlPct: number;
}

export function markPosition(pos: PaperPosition, markPrice: number): MarkedPosition {
  const marketValue = markPrice * pos.quantity * 100;
  const pnl = marketValue - pos.entryCost;
  return {
    ...pos,
    markPrice,
    marketValue,
    pnl,
    pnlPct: pos.entryCost > 0 ? pnl / pos.entryCost : 0,
  };
}
