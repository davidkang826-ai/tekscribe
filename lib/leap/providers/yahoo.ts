import type {
  OptionContract,
  OptionType,
  OptionsDataProvider,
  UnderlyingSnapshot,
} from "../types.ts";

// Free, no-key data via Yahoo Finance's public JSON endpoints. This is an
// unofficial source: quotes are delayed, the schema can change without notice,
// and it may rate-limit. Good enough to run the screener for real; swap in a
// paid provider by implementing the same OptionsDataProvider interface.
//
// If you run behind an outbound proxy, Node's fetch honours NODE_USE_ENV_PROXY=1
// with HTTPS_PROXY set.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface YahooOptions {
  minExpiryDays: number;
  maxExpiryDays: number;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

export class YahooProvider implements OptionsDataProvider {
  name = "yahoo";
  private opts: YahooOptions;
  constructor(opts: YahooOptions) {
    this.opts = opts;
  }

  async getUnderlying(symbol: string): Promise<UnderlyingSnapshot> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const data = (await getJson(url)) as any;
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error(`no chart data for ${symbol}`);
    const meta = result.meta ?? {};
    const closes: number[] = (result.indicators?.quote?.[0]?.close ?? []).filter(
      (v: number | null): v is number => typeof v === "number" && v > 0,
    );
    const highs: number[] = (result.indicators?.quote?.[0]?.high ?? []).filter(
      (v: number | null): v is number => typeof v === "number" && v > 0,
    );
    const lows: number[] = (result.indicators?.quote?.[0]?.low ?? []).filter(
      (v: number | null): v is number => typeof v === "number" && v > 0,
    );

    // Annualized realized volatility from daily log returns.
    const rets: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      rets.push(Math.log(closes[i] / closes[i - 1]));
    }
    const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
    const variance =
      rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length > 1 ? rets.length - 1 : 1);
    const realizedVol = Math.sqrt(variance) * Math.sqrt(252);

    return {
      symbol,
      price: meta.regularMarketPrice ?? closes[closes.length - 1],
      realizedVol,
      high52w: highs.length ? Math.max(...highs) : undefined,
      low52w: lows.length ? Math.min(...lows) : undefined,
    };
  }

  async getLeapChain(symbol: string, type: OptionType): Promise<OptionContract[]> {
    const base = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
    const first = (await getJson(base)) as any;
    const chain = first?.optionChain?.result?.[0];
    if (!chain) throw new Error(`no option chain for ${symbol}`);

    const todayMs = Date.now();
    const expirations: number[] = chain.expirationDates ?? [];
    const wanted = expirations.filter((epoch) => {
      const days = (epoch * 1000 - todayMs) / (1000 * 60 * 60 * 24);
      return days >= this.opts.minExpiryDays && days <= this.opts.maxExpiryDays;
    });

    const contracts: OptionContract[] = [];
    for (const epoch of wanted) {
      const data = (await getJson(`${base}?date=${epoch}`)) as any;
      const res = data?.optionChain?.result?.[0];
      const raw = (type === "call" ? res?.options?.[0]?.calls : res?.options?.[0]?.puts) ?? [];
      for (const o of raw) {
        contracts.push({
          symbol,
          type,
          strike: o.strike,
          expiry: new Date(o.expiration * 1000).toISOString().slice(0, 10),
          bid: o.bid ?? 0,
          ask: o.ask ?? 0,
          lastPrice: o.lastPrice ?? 0,
          openInterest: o.openInterest ?? 0,
          volume: o.volume ?? 0,
          impliedVolatility: o.impliedVolatility,
        });
      }
    }
    return contracts;
  }
}
