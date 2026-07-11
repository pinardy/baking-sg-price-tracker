import { db } from '../db/connection.js';
import { parsePackSize } from '../lib/packSize.js';
import { createPoliteFetch } from '../lib/politeFetch.js';
import { getProvider, getProviders, isKnownProvider } from '../providers/registry.js';
import type { FetchContext, LinkRef, PriceResult } from '../providers/types.js';
import { evaluateAlerts } from './alerts.js';
import { FxService } from './fx.js';

export type FetchTrigger = 'startup' | 'cron' | 'manual';

interface LinkRow extends LinkRef {
  id: number;
  providerId: string;
  packSource: string;
}

let running = false;

export function isFetchRunning(): boolean {
  return running;
}

export function getLastRun(): unknown {
  return db
    .prepare('SELECT * FROM fetch_runs ORDER BY id DESC LIMIT 1')
    .get();
}

/**
 * Fetches current prices for every active link of every active product.
 * Providers run in parallel; politeFetch keeps each host serial and spaced.
 * Individual link failures are logged, never abort the run.
 */
export async function runFetch(trigger: FetchTrigger, onlyLinkIds?: number[]): Promise<number | null> {
  if (running) return null;
  running = true;

  const runId = db
    .prepare('INSERT INTO fetch_runs (trigger) VALUES (?)')
    .run(trigger).lastInsertRowid as number;

  try {
    let sql = `
      SELECT l.id, l.provider_id AS providerId, l.external_id AS externalId,
             l.variant_id AS variantId, l.query, l.url, l.pack_source AS packSource
      FROM product_links l
      JOIN products p ON p.id = l.product_id
      WHERE l.is_active = 1 AND p.is_active = 1`;
    const params: unknown[] = [];
    if (onlyLinkIds?.length) {
      sql += ` AND l.id IN (${onlyLinkIds.map(() => '?').join(',')})`;
      params.push(...onlyLinkIds);
    }
    const links = db.prepare(sql).all(...params) as LinkRow[];

    const ctx: FetchContext = { fetch: createPoliteFetch(), cache: new Map() };
    const fx = new FxService(ctx.fetch);
    // All launch shops price in SGD, so no rates are prefetched; backfillSgd
    // still self-heals if a non-SGD source is ever added.
    await fx.refresh([]);

    const insertSnapshot = db.prepare(
      'INSERT INTO price_snapshots (link_id, run_id, price, currency, in_stock, price_sgd) VALUES (?, ?, ?, ?, ?, ?)',
    );

    const byProvider = new Map<string, LinkRow[]>();
    for (const link of links) {
      (byProvider.get(link.providerId) ?? byProvider.set(link.providerId, []).get(link.providerId)!).push(link);
    }

    let okCount = 0;
    const errors: { linkId: number; message: string }[] = [];

    let skippedProviders = 0;
    await Promise.all(
      [...byProvider.entries()].map(async ([providerId, providerLinks]) => {
        const provider = getProvider(providerId);
        if (!provider && isKnownProvider(providerId)) {
          // Filtered out (e.g. residential-only in CI): skip silently — the
          // last committed snapshot stands and the UI's staleness marker
          // signals age. Only truly unknown providers count as errors.
          skippedProviders++;
          return;
        }
        for (const link of providerLinks) {
          if (!provider) {
            errors.push({ linkId: link.id, message: `provider ${providerId} unavailable` });
            continue;
          }
          try {
            const result = await provider.fetchPrice(link, ctx);
            insertSnapshot.run(
              link.id,
              runId,
              result.price,
              result.currency,
              result.inStock == null ? null : Number(result.inStock),
              fx.toSgd(result.price, result.currency),
            );
            refreshPackSize(link, result);
            okCount++;
          } catch (err) {
            errors.push({ linkId: link.id, message: err instanceof Error ? err.message : String(err) });
          }
        }
      }),
    );
    if (skippedProviders) {
      console.log(`[fetch] skipped ${skippedProviders} filtered provider(s) (FETCH_PROVIDERS/SKIP_PROVIDERS/CI)`);
    }

    db.prepare(
      `UPDATE fetch_runs SET finished_at = datetime('now'), ok_count = ?, error_count = ?, error_log = ? WHERE id = ?`,
    ).run(okCount, errors.length, errors.length ? JSON.stringify(errors) : null, runId);

    await backfillSgd(fx);
    evaluateAlerts(runId);
    console.log(`[fetch] run ${runId} (${trigger}): ${okCount} ok, ${errors.length} errors`);
    return runId;
  } finally {
    running = false;
  }
}

/**
 * Self-healing conversion sweep: fills price_sgd on any snapshot still
 * missing it — historical rows from before the SGD migration, rows whose
 * rate fetch failed that day, and currencies we didn't anticipate.
 */
async function backfillSgd(fx: FxService): Promise<void> {
  const pending = db
    .prepare(
      "SELECT DISTINCT currency FROM price_snapshots WHERE price_sgd IS NULL AND currency != 'SGD'",
    )
    .all() as { currency: string }[];
  if (!pending.length) return;

  const missing = pending.map((r) => r.currency).filter((c) => fx.rateToSgd(c) == null);
  if (missing.length) await fx.refresh(missing);

  const update = db.prepare(
    'UPDATE price_snapshots SET price_sgd = price * ? WHERE price_sgd IS NULL AND currency = ?',
  );
  for (const { currency } of pending) {
    const rate = fx.rateToSgd(currency);
    if (rate == null) {
      console.warn(`[fx] no rate for ${currency}, snapshots left unconverted`);
      continue;
    }
    const { changes } = update.run(rate, currency);
    if (changes) console.log(`[fx] backfilled ${changes} ${currency} snapshots to SGD`);
  }
}

/**
 * Keeps a link's pack size current with what the shop reports (a structured
 * field or the listing title), without ever clobbering a manual correction.
 */
function refreshPackSize(link: LinkRow, result: PriceResult): void {
  if (link.packSource === 'manual') return;
  const pack = result.packSize ?? (result.title ? parsePackSize(result.title) : null);
  if (!pack) return;
  const source = result.packSize ? (result.packSource ?? 'provider') : 'parsed';
  db.prepare('UPDATE product_links SET pack_qty = ?, pack_unit = ?, pack_source = ? WHERE id = ?').run(
    pack.qty,
    pack.unit,
    source,
    link.id,
  );
}

export function getEnabledProviders() {
  return getProviders().map((p) => ({
    id: p.id,
    label: p.label,
    kind: p.kind,
    residentialOnly: p.residentialOnly ?? false,
  }));
}
