// LEAP asymmetry screener + paper-trading CLI.
//
// Run with Node 22+ (built-in TypeScript, no build step):
//   node scripts/leap.ts screen
//   node scripts/leap.ts screen --provider yahoo --budget 200
//   node scripts/leap.ts open
//   node scripts/leap.ts status
//   node scripts/leap.ts mark
//   node scripts/leap.ts reset
//
// This is an analysis and simulation tool. It does not connect to a broker and
// places no real orders. Free data is delayed and unofficial. Not financial
// advice. See lib/leap/README.md for the methodology and its limitations.

import { DEFAULT_CONFIG, DEFAULT_UNIVERSE } from "../lib/leap/config.ts";
import { MockProvider } from "../lib/leap/providers/mock.ts";
import { YahooProvider } from "../lib/leap/providers/yahoo.ts";
import { allocateBudget, screenUniverse } from "../lib/leap/screen.ts";
import {
  loadPortfolio,
  markPosition,
  openPositions,
  savePortfolio,
  type PaperPortfolio,
} from "../lib/leap/portfolio.ts";
import type {
  OptionsDataProvider,
  ScenarioConfig,
  ScoredCandidate,
  ScreenConfig,
} from "../lib/leap/types.ts";

type Args = { _: string[]; flags: Record<string, string> };

function parseArgs(argv: string[]): Args {
  const _: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      _.push(a);
    }
  }
  return { _, flags };
}

function parseScenario(raw: string | undefined): ScenarioConfig {
  if (!raw) return DEFAULT_CONFIG.scenario;
  if (raw === "high") return { kind: "fiftyTwoWeekHigh" };
  if (raw.startsWith("return:")) return { kind: "returnTo", fraction: Number(raw.slice(7)) };
  if (raw.startsWith("sigma:")) return { kind: "sigma", sigmas: Number(raw.slice(6)) };
  return DEFAULT_CONFIG.scenario;
}

function buildConfig(flags: Record<string, string>): ScreenConfig {
  return {
    ...DEFAULT_CONFIG,
    totalBudgetUsd: flags.budget ? Number(flags.budget) : DEFAULT_CONFIG.totalBudgetUsd,
    types: flags.type === "put" ? ["put"] : flags.type === "both" ? ["call", "put"] : ["call"],
    scenario: parseScenario(flags.scenario),
  };
}

function buildProvider(flags: Record<string, string>, config: ScreenConfig): OptionsDataProvider {
  if (flags.provider === "yahoo") {
    return new YahooProvider({
      minExpiryDays: config.minExpiryDays,
      maxExpiryDays: config.maxExpiryDays,
    });
  }
  return new MockProvider();
}

function universeFrom(flags: Record<string, string>): string[] {
  if (flags.symbols) return flags.symbols.split(",").map((s) => s.trim().toUpperCase());
  return DEFAULT_UNIVERSE;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function describe(c: ScoredCandidate): string {
  const k = c.contract;
  const a = c.analysis;
  return (
    `${k.symbol} ${k.type.toUpperCase()} $${k.strike} exp ${k.expiry}  ` +
    `score ${c.score.toFixed(0)}\n` +
    `    spot ${money(c.underlying.price)}  cost ${money(a.contractCost)}  ` +
    `IV ${pct(a.impliedVol)} vs realized ${pct(c.underlying.realizedVol)}  ` +
    `delta ${a.delta.toFixed(2)}\n` +
    `    fair-value edge ${a.edgeRatio.toFixed(2)}x  ` +
    `scenario ${a.targetMultiple.toFixed(1)}x (target ${money(a.scenarioPrice)})  ` +
    `breakeven ${pct(a.breakevenPct)} move  win-odds ${pct(a.probProfit)}`
  );
}

function printCandidates(candidates: ScoredCandidate[], top: number): void {
  const shown = candidates.slice(0, top);
  if (shown.length === 0) {
    console.log("No candidates passed the filters. Try loosening --budget or the universe.");
    return;
  }
  shown.forEach((c, i) => {
    console.log(`\n${i + 1}. ${describe(c)}`);
    for (const r of c.reasons) console.log(`    - ${r}`);
  });
}

async function runScreen(args: Args): Promise<ScoredCandidate[]> {
  const config = buildConfig(args.flags);
  const provider = buildProvider(args.flags, config);
  const universe = universeFrom(args.flags);
  const now = new Date();

  console.log(
    `Screening ${universe.length} names via ${provider.name} provider, ` +
      `budget ${money(config.totalBudgetUsd)} per contract cap.`,
  );
  const result = await screenUniverse(provider, universe, config, now);
  console.log(
    `Scanned ${result.scanned} contracts, ${result.candidates.length} passed filters.` +
      (result.errors.length ? ` ${result.errors.length} symbols errored.` : ""),
  );
  return result.candidates;
}

async function cmdScreen(args: Args): Promise<void> {
  const candidates = await runScreen(args);
  const top = args.flags.top ? Number(args.flags.top) : 10;
  printCandidates(candidates, top);
  console.log(
    "\nThis is analysis only. Run `open` to add the top picks to your paper portfolio.",
  );
}

async function cmdOpen(args: Args): Promise<void> {
  const config = buildConfig(args.flags);
  const candidates = await runScreen(args);
  const allocations = allocateBudget(candidates, config.totalBudgetUsd);
  if (allocations.length === 0) {
    console.log("Nothing affordable within the budget. No paper positions opened.");
    return;
  }

  const portfolio = await loadPortfolio(config.totalBudgetUsd);
  const now = new Date();
  const opened = openPositions(portfolio, allocations, now);
  await savePortfolio(portfolio);

  console.log(`\nOpened ${opened.length} paper position(s):`);
  for (const p of opened) {
    console.log(
      `  ${p.symbol} ${p.type.toUpperCase()} $${p.strike} exp ${p.expiry}  ` +
        `x${p.quantity}  cost ${money(p.entryCost)}  (score ${p.scoreAtEntry.toFixed(0)})`,
    );
    console.log(`    thesis: ${p.thesis}`);
  }
  console.log(`\nSimulated cash remaining: ${money(portfolio.cash)}`);
}

async function cmdStatus(): Promise<void> {
  const portfolio = await loadPortfolio(DEFAULT_CONFIG.totalBudgetUsd);
  printPortfolio(portfolio);
}

function printPortfolio(portfolio: PaperPortfolio): void {
  console.log(
    `\nPaper portfolio: starting ${money(portfolio.startingCapital)}, ` +
      `cash ${money(portfolio.cash)}, ${portfolio.positions.length} open position(s).`,
  );
  for (const p of portfolio.positions) {
    console.log(
      `  ${p.symbol} ${p.type.toUpperCase()} $${p.strike} exp ${p.expiry}  ` +
        `x${p.quantity}  entry ${money(p.entryPrice)}/sh  cost ${money(p.entryCost)}`,
    );
  }
  if (portfolio.closed.length) {
    const realized = portfolio.closed.reduce((a, c) => a + c.pnl, 0);
    console.log(`  Closed: ${portfolio.closed.length}, realized P&L ${money(realized)}`);
  }
}

async function cmdMark(args: Args): Promise<void> {
  const config = buildConfig(args.flags);
  const provider = buildProvider(args.flags, config);
  const portfolio = await loadPortfolio(config.totalBudgetUsd);
  if (portfolio.positions.length === 0) {
    console.log("No open paper positions to mark.");
    return;
  }

  let totalValue = 0;
  let totalCost = 0;
  console.log(`\nMarking ${portfolio.positions.length} position(s) via ${provider.name}:`);
  for (const p of portfolio.positions) {
    let mark = p.entryPrice;
    try {
      const chain = await provider.getLeapChain(p.symbol, p.type);
      const match = chain.find((c) => c.strike === p.strike && c.expiry === p.expiry);
      if (match) {
        mark = match.bid > 0 && match.ask > 0 ? (match.bid + match.ask) / 2 : match.lastPrice;
      }
    } catch {
      // Keep entry price as the mark if the feed fails for this name.
    }
    const marked = markPosition(p, mark);
    totalValue += marked.marketValue;
    totalCost += p.entryCost;
    const sign = marked.pnl >= 0 ? "+" : "";
    console.log(
      `  ${p.symbol} ${p.type.toUpperCase()} $${p.strike}  ` +
        `mark ${money(mark)}/sh  value ${money(marked.marketValue)}  ` +
        `P&L ${sign}${money(marked.pnl)} (${sign}${pct(marked.pnlPct)})`,
    );
  }
  const total = totalValue - totalCost;
  const sign = total >= 0 ? "+" : "";
  console.log(
    `\nOpen positions value ${money(totalValue)} on ${money(totalCost)} cost. ` +
      `Unrealized P&L ${sign}${money(total)}.`,
  );
}

async function cmdReset(): Promise<void> {
  const fresh: PaperPortfolio = {
    startingCapital: DEFAULT_CONFIG.totalBudgetUsd,
    cash: DEFAULT_CONFIG.totalBudgetUsd,
    positions: [],
    closed: [],
  };
  await savePortfolio(fresh);
  console.log("Paper portfolio reset.");
}

function help(): void {
  console.log(
    [
      "LEAP asymmetry screener (Cornwall-style cheap convexity) + paper trading.",
      "",
      "Commands:",
      "  screen    Rank cheap, asymmetric LEAP candidates (analysis only)",
      "  open      Add the top affordable picks to the paper portfolio",
      "  status    Show the paper portfolio",
      "  mark      Mark open paper positions to current prices",
      "  reset     Clear the paper portfolio",
      "  help      Show this message",
      "",
      "Flags:",
      "  --provider mock|yahoo   Data source (default mock, offline)",
      "  --budget N              Capital cap in dollars (default 200)",
      "  --symbols A,B,C         Override the universe",
      "  --type call|put|both    Option side (default call)",
      "  --scenario sigma:2|high|return:1.5   Convexity target (default sigma:2)",
      "  --top N                 How many candidates to print (default 10)",
      "",
      "Analysis and simulation only. No broker, no real orders. Not financial advice.",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] ?? "help";
  switch (cmd) {
    case "screen":
      await cmdScreen(args);
      break;
    case "open":
      await cmdOpen(args);
      break;
    case "status":
      await cmdStatus();
      break;
    case "mark":
      await cmdMark(args);
      break;
    case "reset":
      await cmdReset();
      break;
    default:
      help();
  }
}

main().catch((err) => {
  console.error("leap: fatal error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
