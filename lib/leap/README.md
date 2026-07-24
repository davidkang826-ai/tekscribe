# LEAP asymmetry screener

A self-contained tool that hunts for long-dated options (LEAPS) that look cheap
in an asymmetric, Cornwall Capital sense: small, capped premium, large potential
payoff, on names where the market appears to underprice the odds of a big move.
It ranks candidates, sizes a small book against a hard capital cap (default
$200), and runs a paper (simulated) portfolio so you can watch a methodology
play out before risking a cent.

It is analysis and simulation only. It connects to no broker and places no real
orders. See "Limitations" at the bottom, and read it before you act on anything
this prints.

## The idea, in one paragraph

Cornwall Capital (Charlie Ledley, Jamie Mai, Ben Hockett, of "The Big Short")
did not have a secret formula. They had a bias they trusted: markets price
options as if the recent past continues and as if returns are thin-tailed
(lognormal), which systematically underprices long-dated, out-of-the-money
convexity. So they bought cheap options where the downside was capped at the
premium and the upside was a large multiple, on situations the crowd deemed
unlikely. This tool operationalizes that bias.

## Methodology

For each contract the engine computes a **real-world fair value** and compares it
to the market's asking price.

1. **Fat-tailed re-pricing (the core).** The market's price embeds a lognormal
   (thin-tailed) distribution at the option's implied volatility. The engine
   instead models the terminal price with a *standardized Student-t*
   distribution (`tailDof` degrees of freedom, default 4) calibrated to the
   stock's *realized* volatility, with a conservative drift. It integrates the
   option payoff against that distribution using deterministic quadrature (no
   random sampling, fully reproducible). The result is `fairValue`, and
   `edgeRatio = fairValue / price`. An edge above 1 means the model thinks the
   convexity is worth more than the market charges.

   The quadrature is validated: with thin tails and matched volatility and
   drift, it reproduces the Black-Scholes price to within ~0.2%, so any edge it
   reports comes from the fat-tail and realized-vs-implied-vol assumptions, not
   from numerical error.

2. **Cheap vol.** Implied volatility relative to realized volatility. When
   implied sits below realized, the option is priced for less movement than the
   stock actually delivers. IV rank (where implied sits in its own range) is
   folded in when the data source provides it.

3. **Convexity / scenario multiple.** How many multiples of the premium the
   position returns if a defined scenario move hits. The default scenario is a
   two-realized-sigma move; you can also target the 52-week high or a fixed
   return. This is the "capped cost, multi-bagger upside" leg.

4. **Tail gap.** The model's probability of finishing profitable minus the
   market's (thin-tailed) probability. A positive gap is the mispricing the
   whole exercise is trying to surface.

5. **Tradeability.** Bid/ask spread and open interest, so a flagged bet is one
   you could actually enter and exit.

These roll into a 0 to 100 composite score (weights in `score.ts`), with hard
filters applied first: LEAP-range expiry, fits the budget cap, minimum open
interest, maximum spread, and a moneyness window. Every candidate carries a
plain-language list of *why* it scored.

Position sizing is greedy and diversified: it takes the best-scored candidate
from each distinct underlying, one contract at a time, until the capital cap is
reached. One contract per name keeps a $200 book from doubling down on a single
bet.

## Usage

Runs on Node 22+ with no build step and no dependencies (Node strips the
TypeScript at load time).

```bash
npm run leap -- screen                 # rank candidates (mock data, offline)
npm run leap -- screen --provider yahoo --budget 200
npm run leap -- open                   # add top affordable picks to paper book
npm run leap -- status                 # show the paper portfolio
npm run leap -- mark --provider yahoo  # mark open positions to current prices
npm run leap -- reset                  # clear the paper portfolio
npm run leap -- help
```

Flags: `--provider mock|yahoo`, `--budget N`, `--symbols A,B,C`,
`--type call|put|both`, `--scenario sigma:2|high|return:1.5`, `--top N`.

The paper portfolio lives in `.data/leap/portfolio.json` (gitignored).

## Data providers

The engine talks to any source that implements `OptionsDataProvider`
(`getUnderlying` + `getLeapChain`). Two are included:

- **mock** (default): deterministic synthetic chains seeded from the ticker.
  Zero network, zero keys, reproducible. For demos and tests only, not market
  data.
- **yahoo**: free, unofficial Yahoo Finance JSON endpoints. Delayed quotes, no
  key required, schema can change without notice. Behind a proxy, Node's fetch
  honours `NODE_USE_ENV_PROXY=1` with `HTTPS_PROXY` set.

To use a paid feed (Polygon, Tradier, and similar), implement the same
interface in `lib/leap/providers/` and pass it to `screenUniverse`. Nothing in
the scoring engine changes.

## Limitations (read this)

- **Not financial advice.** This is a research and simulation tool. It can be
  wrong, and options can expire worthless. The whole premise is buying bets that
  usually lose small so they can occasionally win big.
- **The edge is a modeling assumption, not a fact.** "Cheap" here means cheap
  *relative to a fat-tailed model you chose*. Change `tailDof`, the drift, or the
  volatility estimate and the rankings move. Treat the score as a
  hypothesis-generator, not a verdict.
- **Free data is delayed and unofficial.** Yahoo quotes lag, can be stale on
  illiquid strikes, and the endpoint may rate-limit or break. Verify any real
  quote and its liquidity with a real broker before trading.
- **Realized volatility is backward-looking.** A low implied-versus-realized
  reading can mean the market correctly expects calmer conditions ahead, not a
  mispricing.
- **No transaction costs, slippage, or assignment logic** are modeled in the
  paper portfolio. Wide LEAP spreads alone can erase a thin edge.
- **Simulation only.** No orders are ever sent anywhere.
