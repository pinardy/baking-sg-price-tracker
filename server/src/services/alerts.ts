import { db } from '../db/connection.js';

/**
 * After a fetch run, raise an alert for each product whose lowest
 * SGD-converted snapshot in that run is at or below its target price
 * (targets are SGD since schema v2; alert rows store SGD amounts).
 * A product with an unacknowledged alert doesn't get duplicates.
 */
export function evaluateAlerts(runId: number): void {
  const hits = db
    .prepare(
      `SELECT p.id AS product_id, p.target_price, s.id AS snapshot_id, s.link_id, s.price_sgd
       FROM products p
       JOIN product_links l ON l.product_id = p.id AND l.is_active = 1
       JOIN price_snapshots s ON s.link_id = l.id AND s.run_id = ?
       WHERE p.is_active = 1
         AND p.target_price IS NOT NULL
         AND s.price_sgd IS NOT NULL
         AND s.price_sgd <= p.target_price
       ORDER BY p.id, s.price_sgd ASC`,
    )
    .all(runId) as {
    product_id: number;
    target_price: number;
    snapshot_id: number;
    link_id: number;
    price_sgd: number;
  }[];

  const hasOpenAlert = db.prepare(
    'SELECT 1 FROM alerts WHERE product_id = ? AND acknowledged = 0 LIMIT 1',
  );
  const insertAlert = db.prepare(
    `INSERT INTO alerts (product_id, link_id, snapshot_id, price, currency, target_price)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const seen = new Set<number>();
  for (const hit of hits) {
    if (seen.has(hit.product_id)) continue; // rows are price-ordered, first per product is lowest
    seen.add(hit.product_id);
    if (hasOpenAlert.get(hit.product_id)) continue;
    insertAlert.run(hit.product_id, hit.link_id, hit.snapshot_id, hit.price_sgd, 'SGD', hit.target_price);
    console.log(`[alerts] product ${hit.product_id}: ${hit.price_sgd} SGD <= target ${hit.target_price}`);
  }
}
