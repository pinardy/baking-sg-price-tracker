import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { runCleanup } from '../lib/browser.js';
import { createPoliteFetch } from '../lib/politeFetch.js';
import { getProviders } from '../providers/registry.js';
import type { FetchContext } from '../providers/types.js';
import { parsePackSize } from '../lib/packSize.js';
import { getEnabledProviders, getLastRun, isFetchRunning, runFetch } from '../services/fetcher.js';
import { listAlerts } from '../services/queries.js';

export const miscRouter = Router();

miscRouter.get('/providers', (_req, res) => {
  res.json(getEnabledProviders());
});

miscRouter.get('/search', async (req, res) => {
  const query = String(req.query.q ?? '').trim();
  if (!query) return res.status(400).json({ error: 'q is required' });
  const providerFilter = req.query.providers
    ? String(req.query.providers).split(',')
    : null;

  const providers = getProviders().filter((p) => !providerFilter || providerFilter.includes(p.id));
  const ctx: FetchContext = { fetch: createPoliteFetch(), cache: new Map(), cleanup: [] };

  const settled = await Promise.allSettled(providers.map((p) => p.search(query, ctx)));
  await runCleanup(ctx);
  res.json(
    providers.map((p, i) => {
      const outcome = settled[i];
      return outcome.status === 'fulfilled'
        ? { providerId: p.id, label: p.label, kind: p.kind, results: outcome.value.map(withParsedPack) }
        : { providerId: p.id, label: p.label, kind: p.kind, error: String(outcome.reason?.message ?? outcome.reason) };
    }),
  );
});

/** Generic providers don't parse titles themselves; fill pack size centrally. */
function withParsedPack<T extends { title: string; packQty?: number }>(result: T): T {
  if (result.packQty != null) return result;
  const pack = parsePackSize(result.title);
  return pack ? { ...result, packQty: pack.qty, packUnit: pack.unit } : result;
}

miscRouter.post('/fetch', (_req, res) => {
  if (isFetchRunning()) return res.status(202).json({ status: 'already-running' });
  void runFetch('manual');
  res.status(202).json({ status: 'started' });
});

miscRouter.get('/fetch/status', (_req, res) => {
  res.json({ running: isFetchRunning(), lastRun: getLastRun() });
});

miscRouter.delete('/links/:id', (req, res) => {
  const result = db.prepare('UPDATE product_links SET is_active = 0 WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

const patchLinkSchema = z
  .object({
    pack_qty: z.number().positive().nullable(),
    pack_unit: z.enum(['g', 'kg', 'ml', 'l', 'pcs']).nullable(),
  })
  .refine((v) => (v.pack_qty == null) === (v.pack_unit == null), {
    message: 'pack_qty and pack_unit must be set (or cleared) together',
  });

// Manual pack-size override; nulls reset to 'none' so the next fetch reparses.
miscRouter.patch('/links/:id', (req, res) => {
  const parsed = patchLinkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { pack_qty, pack_unit } = parsed.data;
  const result = db
    .prepare('UPDATE product_links SET pack_qty = ?, pack_unit = ?, pack_source = ? WHERE id = ?')
    .run(pack_qty, pack_unit, pack_qty == null ? 'none' : 'manual', req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'not found' });
  res.json(db.prepare('SELECT * FROM product_links WHERE id = ?').get(req.params.id));
});

miscRouter.get('/alerts', (req, res) => {
  res.json(listAlerts(req.query.unacknowledged === '1'));
});

miscRouter.post('/alerts/:id/ack', (req, res) => {
  const result = db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

miscRouter.post('/alerts/ack-all', (_req, res) => {
  db.prepare('UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0').run();
  res.status(204).end();
});
