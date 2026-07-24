import { bsPrice, yearsToExpiry } from "../blackScholes.ts";
import { RISK_FREE_RATE, DIVIDEND_YIELD } from "../config.ts";
import type {
  OptionContract,
  OptionType,
  OptionsDataProvider,
  UnderlyingSnapshot,
} from "../types.ts";

// A deterministic, offline data source. It fabricates internally consistent
// option chains (priced with Black-Scholes at a per-name implied vol) so the
// engine can be demonstrated and tested with zero network access and no API
// keys. Values are seeded from the ticker string, so runs are reproducible.
//
// It intentionally makes some names cheap-vol (implied below realized) so the
// screener has something to find. It is NOT market data. Do not trade on it.

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // 0..1
}

function isoDaysFromNow(days: number, now: Date): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export class MockProvider implements OptionsDataProvider {
  name = "mock";
  private now: Date;

  constructor(now?: Date) {
    this.now = now ?? new Date();
  }

  async getUnderlying(symbol: string): Promise<UnderlyingSnapshot> {
    const h = hash(symbol);
    const h2 = hash(symbol + "vol");
    const price = 8 + h * 240; // roughly 8..248
    const realizedVol = 0.35 + h2 * 0.55; // 0.35..0.90
    return {
      symbol,
      price,
      realizedVol,
      high52w: price * (1.2 + h * 0.6),
      low52w: price * (0.55 + h2 * 0.2),
      ivRank: hash(symbol + "rank"),
    };
  }

  async getLeapChain(symbol: string, type: OptionType): Promise<OptionContract[]> {
    const u = await this.getUnderlying(symbol);
    // Implied vol as a multiple of realized. Some names come out below 1.0
    // (cheap movement), which is what the screener rewards.
    const ivFactor = 0.75 + hash(symbol + "iv") * 0.5; // 0.75..1.25
    const iv = u.realizedVol * ivFactor;

    const expiries = [
      isoDaysFromNow(330, this.now),
      isoDaysFromNow(540, this.now),
    ];
    const contracts: OptionContract[] = [];

    for (const expiry of expiries) {
      const t = yearsToExpiry(expiry, this.now);
      // Strikes from 0.8x to 1.8x spot.
      for (let m = 0.8; m <= 1.8001; m += 0.1) {
        const strike = Math.round(u.price * m);
        if (strike <= 0) continue;
        const fair = bsPrice(type, u.price, strike, t, iv, RISK_FREE_RATE, DIVIDEND_YIELD);
        if (fair < 0.02) continue; // skip worthless quotes
        const spread = Math.max(0.02, fair * 0.06);
        const bid = Math.max(0.01, fair - spread / 2);
        const ask = fair + spread / 2;
        // More open interest near the money, thinning out in the tails.
        const oi = Math.round(500 * Math.exp(-Math.pow((m - 1) * 3, 2))) + 40;
        contracts.push({
          symbol,
          type,
          strike,
          expiry,
          bid: Number(bid.toFixed(2)),
          ask: Number(ask.toFixed(2)),
          lastPrice: Number(fair.toFixed(2)),
          openInterest: oi,
          volume: Math.round(oi * 0.3),
          impliedVolatility: iv,
        });
      }
    }
    return contracts;
  }
}
