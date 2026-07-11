import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { parsePackSize, type PackSize } from '../lib/packSize.js';
import { runFetch } from '../services/fetcher.js';
import { getHistory, getProduct, listProducts } from '../services/queries.js';

export const productsRouter = Router();

export const CATEGORIES = [
  'flour',
  'sugar',
  'dairy',
  'eggs',
  'leavening',
  'chocolate-cocoa',
  'nuts-seeds',
  'flavoring',
  'other',
] as const;

const packUnitSchema = z.enum(['g', 'kg', 'ml', 'l', 'pcs']);

const linkPickSchema = z.object({
  providerId: z.string(),
  externalId: z.string().nullable().optional(),
  variantId: z.string().nullable().optional(),
  query: z.string().nullable().optional(),
  title: z.string().optional(),
  url: z.string().url(),
  // Explicit pack size from the UI counts as a manual override; otherwise
  // the title is parsed and fetch runs keep it fresh.
  packQty: z.number().positive().optional(),
  packUnit: packUnitSchema.optional(),
});

type LinkPick = z.infer<typeof linkPickSchema>;

const createProductSchema = z.object({
  name: z.string().min(1),
  category: z.enum(CATEGORIES),
  brand: z.string().optional(),
  variant_desc: z.string().optional(),
  target_price: z.number().positive().nullable().optional(),
  target_currency: z.string().default('SGD'),
  links: z.array(linkPickSchema).default([]),
});

function linkPackFields(link: LinkPick): { qty: number | null; unit: PackSize['unit'] | null; source: string } {
  if (link.packQty != null && link.packUnit) {
    return { qty: link.packQty, unit: link.packUnit, source: 'manual' };
  }
  const parsed = link.title ? parsePackSize(link.title) : null;
  return parsed
    ? { qty: parsed.qty, unit: parsed.unit, source: 'parsed' }
    : { qty: null, unit: null, source: 'none' };
}

const patchProductSchema = z.object({
  name: z.string().min(1).optional(),
  brand: z.string().nullable().optional(),
  variant_desc: z.string().nullable().optional(),
  target_price: z.number().positive().nullable().optional(),
  target_currency: z.string().optional(),
  is_active: z.boolean().optional(),
});

productsRouter.get('/', (_req, res) => {
  res.json(listProducts());
});

productsRouter.post('/', (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { links, ...product } = parsed.data;

  const insertLink = db.prepare(
    `INSERT INTO product_links (product_id, provider_id, external_id, variant_id, query, url, title,
                                pack_qty, pack_unit, pack_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const linkIds: number[] = [];
  const productId = db.transaction(() => {
    const id = db
      .prepare(
        `INSERT INTO products (name, category, brand, variant_desc, target_price, target_currency)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        product.name,
        product.category,
        product.brand ?? null,
        product.variant_desc ?? null,
        product.target_price ?? null,
        product.target_currency,
      ).lastInsertRowid as number;
    for (const link of links) {
      const pack = linkPackFields(link);
      const result = insertLink.run(
        id,
        link.providerId,
        link.externalId ?? null,
        link.variantId ?? null,
        link.query ?? null,
        link.url,
        link.title ?? null,
        pack.qty,
        pack.unit,
        pack.source,
      );
      linkIds.push(result.lastInsertRowid as number);
    }
    return id;
  })();

  // Fire-and-forget: get first prices for the new links right away.
  if (linkIds.length) void runFetch('manual', linkIds);

  res.status(201).json({ id: productId });
});

productsRouter.get('/:id', (req, res) => {
  const product = getProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'not found' });
  res.json(product);
});

productsRouter.patch('/:id', (req, res) => {
  const parsed = patchProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const fields = parsed.data;
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    sets.push(`${key} = ?`);
    values.push(typeof value === 'boolean' ? Number(value) : value);
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields to update' });
  const result = db
    .prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'not found' });
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

productsRouter.delete('/:id', (req, res) => {
  const result = db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

productsRouter.get('/:id/history', (req, res) => {
  const days = Math.min(parseInt(String(req.query.days ?? '90'), 10) || 90, 3650);
  res.json(getHistory(req.params.id, days));
});

productsRouter.post('/:id/links', (req, res) => {
  const parsed = linkPickSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'not found' });
  const link = parsed.data;
  const pack = linkPackFields(link);
  const result = db
    .prepare(
      `INSERT INTO product_links (product_id, provider_id, external_id, variant_id, query, url, title,
                                  pack_qty, pack_unit, pack_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      req.params.id,
      link.providerId,
      link.externalId ?? null,
      link.variantId ?? null,
      link.query ?? null,
      link.url,
      link.title ?? null,
      pack.qty,
      pack.unit,
      pack.source,
    );
  void runFetch('manual', [result.lastInsertRowid as number]);
  res.status(201).json({ id: result.lastInsertRowid });
});
