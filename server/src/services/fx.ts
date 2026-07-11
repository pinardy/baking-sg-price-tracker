import { db } from '../db/connection.js';
import type { PoliteFetch } from '../lib/politeFetch.js';

const FX_API = 'https://api.frankfurter.dev/v1/latest';

/**
 * Fetches SGD-per-unit rates for the given currencies from frankfurter.dev
 * (free ECB reference rates, no key). Returns null on any failure.
 */
export async function fetchSgdRates(
  fetch: PoliteFetch,
  currencies: string[],
): Promise<Record<string, number> | null> {
  const symbols = [...new Set(currencies.filter((c) => c && c !== 'SGD'))];
  if (!symbols.length) return {};
  try {
    const response = await fetch(`${FX_API}?base=SGD&symbols=${symbols.join(',')}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { rates?: Record<string, number> };
    const rates: Record<string, number> = {};
    for (const currency of symbols) {
      const sgdPerBase = body.rates?.[currency];
      if (typeof sgdPerBase === 'number' && Number.isFinite(sgdPerBase) && sgdPerBase > 0) {
        rates[currency] = 1 / sgdPerBase; // API gives X per SGD; we want SGD per X
      }
    }
    return rates;
  } catch {
    return null;
  }
}

/**
 * Rate cache backed by the fx_rates table, so the last known rates survive
 * an API outage — a stale conversion beats no conversion.
 */
export class FxService {
  private rates = new Map<string, number>();

  constructor(private fetch: PoliteFetch) {
    const stored = db.prepare('SELECT currency, rate_to_sgd FROM fx_rates').all() as {
      currency: string;
      rate_to_sgd: number;
    }[];
    for (const row of stored) this.rates.set(row.currency, row.rate_to_sgd);
  }

  /** Fetches fresh rates and upserts them; on failure keeps stored rates. Never throws. */
  async refresh(currencies: string[]): Promise<void> {
    const fresh = await fetchSgdRates(this.fetch, currencies);
    if (!fresh) {
      console.warn('[fx] rate fetch failed, using stored rates');
      return;
    }
    const upsert = db.prepare(
      `INSERT INTO fx_rates (currency, rate_to_sgd, fetched_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(currency) DO UPDATE SET rate_to_sgd = excluded.rate_to_sgd, fetched_at = excluded.fetched_at`,
    );
    for (const [currency, rate] of Object.entries(fresh)) {
      this.rates.set(currency, rate);
      upsert.run(currency, rate);
    }
  }

  rateToSgd(currency: string): number | null {
    if (currency === 'SGD') return 1;
    return this.rates.get(currency) ?? null;
  }

  toSgd(price: number, currency: string): number | null {
    const rate = this.rateToSgd(currency);
    return rate == null ? null : price * rate;
  }
}
