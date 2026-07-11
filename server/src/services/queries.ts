import { db } from '../db/connection.js';
import { unitPrice } from '../lib/packSize.js';

/** Latest snapshot per link, joined onto product links. */
const LINKS_WITH_LATEST = `
  SELECT l.*, s.price AS latest_price, s.currency AS latest_currency,
         s.price_sgd AS latest_price_sgd,
         s.in_stock AS latest_in_stock, s.scraped_at AS latest_scraped_at
  FROM product_links l
  LEFT JOIN price_snapshots s ON s.id = (
    SELECT id FROM price_snapshots WHERE link_id = l.id ORDER BY scraped_at DESC, id DESC LIMIT 1
  )`;

/** Attaches derived unit price (SGD per kg/L/pc) to a link row. */
function withUnitPrice(link: any): any {
  const derived = unitPrice(link.latest_price_sgd, link.pack_qty, link.pack_unit);
  return {
    ...link,
    unit_price_sgd: derived?.unitPrice ?? null,
    unit_base: derived?.base ?? null,
  };
}

export function listProducts(): any[] {
  const products = db
    .prepare("SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC")
    .all() as any[];
  const links = (db.prepare(`${LINKS_WITH_LATEST} WHERE l.is_active = 1`).all() as any[]).map(withUnitPrice);

  const byProduct = new Map<number, any[]>();
  for (const link of links) {
    (byProduct.get(link.product_id) ?? byProduct.set(link.product_id, []).get(link.product_id)!).push(link);
  }
  return products.map((p) => {
    const productLinks = byProduct.get(p.id) ?? [];
    const priced = productLinks.filter((l) => l.latest_price != null);
    // Rank in SGD. Links without a conversion yet (rate fetch never ran)
    // fall back to a single-currency comparison rather than mixing units.
    const converted = priced.filter((l) => l.latest_price_sgd != null);
    const lowest = converted.length
      ? converted.reduce((a, b) => (b.latest_price_sgd < a.latest_price_sgd ? b : a))
      : lowestSingleCurrency(priced);
    const cheapestPerUnit = lowestUnitPrice(productLinks);
    return {
      ...p,
      links: productLinks,
      lowest: lowest
        ? {
            price: lowest.latest_price,
            currency: lowest.latest_currency,
            price_sgd: lowest.latest_price_sgd ?? null,
            provider_id: lowest.provider_id,
            url: lowest.url,
          }
        : null,
      cheapest_per_unit: cheapestPerUnit
        ? {
            unit_price_sgd: cheapestPerUnit.unit_price_sgd,
            unit_base: cheapestPerUnit.unit_base,
            provider_id: cheapestPerUnit.provider_id,
            url: cheapestPerUnit.url,
          }
        : null,
    };
  });
}

function lowestSingleCurrency(priced: any[]): any | null {
  const pool = priced.filter((l) => l.latest_currency === priced[0]?.latest_currency);
  return pool.length ? pool.reduce((a, b) => (b.latest_price < a.latest_price ? b : a)) : null;
}

/**
 * Cheapest link by unit price, compared within the product's dominant base
 * unit (a product mixing $/kg and $/pc links only ranks the majority base).
 */
function lowestUnitPrice(links: any[]): any | null {
  const priced = links.filter((l) => l.unit_price_sgd != null);
  if (!priced.length) return null;
  const baseCounts = new Map<string, number>();
  for (const l of priced) baseCounts.set(l.unit_base, (baseCounts.get(l.unit_base) ?? 0) + 1);
  const dominantBase = [...baseCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return priced
    .filter((l) => l.unit_base === dominantBase)
    .reduce((a, b) => (b.unit_price_sgd < a.unit_price_sgd ? b : a));
}

export function getProduct(id: number | string): any | null {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) return null;
  const links = (
    db.prepare(`${LINKS_WITH_LATEST} WHERE l.product_id = ? AND l.is_active = 1`).all(id) as any[]
  ).map(withUnitPrice);
  return { ...(product as object), links };
}

export function getHistory(productId: number | string, days: number): any[] {
  return db
    .prepare(
      `SELECT s.link_id, l.provider_id, s.price, s.currency, s.price_sgd, s.scraped_at,
              l.pack_qty, l.pack_unit
       FROM price_snapshots s
       JOIN product_links l ON l.id = s.link_id
       WHERE l.product_id = ? AND s.scraped_at > datetime('now', ?)
       ORDER BY s.scraped_at ASC`,
    )
    .all(productId, `-${days} days`);
}

export function listAlerts(onlyOpen: boolean): any[] {
  return db
    .prepare(
      `SELECT a.*, p.name AS product_name, l.provider_id, l.url AS link_url
       FROM alerts a
       JOIN products p ON p.id = a.product_id
       LEFT JOIN product_links l ON l.id = a.link_id
       ${onlyOpen ? 'WHERE a.acknowledged = 0' : ''}
       ORDER BY a.created_at DESC LIMIT 200`,
    )
    .all();
}
