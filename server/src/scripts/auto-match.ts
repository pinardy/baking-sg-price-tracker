import 'dotenv/config';
import { db } from '../db/connection.js';
import { migrate } from '../db/migrate.js';
import { runCleanup } from '../lib/browser.js';
import { createPoliteFetch } from '../lib/politeFetch.js';
import { getProviders } from '../providers/registry.js';
import type { FetchContext, SearchResult } from '../providers/types.js';

// Best-effort link seeding: for each product with no link at a provider yet,
// search that provider and auto-attach only high-confidence hits (every
// word of the product name appears in the result title and a pack size was
// detected). Everything else is printed for manual attachment via the UI.
// Run locally, eyeball the output, then `npm run fetch:once` and commit.
migrate();

const products = db
  .prepare('SELECT id, name FROM products WHERE is_active = 1 ORDER BY id')
  .all() as { id: number; name: string }[];
const linkExists = db.prepare(
  'SELECT 1 FROM product_links WHERE product_id = ? AND provider_id = ? AND is_active = 1',
);
const insertLink = db.prepare(
  `INSERT INTO product_links (product_id, provider_id, external_id, variant_id, query, url, title,
                              pack_qty, pack_unit, pack_source)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const ctx: FetchContext = { fetch: createPoliteFetch(), cache: new Map(), cleanup: [] };
const providers = getProviders();

function significantTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function isConfident(product: { name: string }, result: SearchResult): boolean {
  const title = result.title.toLowerCase();
  return significantTokens(product.name).every((t) => title.includes(t)) && result.packQty != null;
}

let attached = 0;
const review: string[] = [];

for (const product of products) {
  for (const provider of providers) {
    if (linkExists.get(product.id, provider.id)) continue;
    let results: SearchResult[];
    try {
      results = await provider.search(product.name, ctx);
    } catch (err) {
      review.push(`${product.name} @ ${provider.id}: search failed (${err instanceof Error ? err.message : err})`);
      continue;
    }
    const confident = results.filter((r) => isConfident(product, r));
    if (confident.length === 1) {
      const r = confident[0];
      insertLink.run(
        product.id,
        provider.id,
        r.externalId,
        r.variantId ?? null,
        r.query ?? null,
        r.url,
        r.title,
        r.packQty ?? null,
        r.packUnit ?? null,
        r.packQty != null ? 'parsed' : 'none',
      );
      attached++;
      console.log(`✔ ${product.name} @ ${provider.id}: ${r.title}`);
    } else {
      const top = results
        .slice(0, 3)
        .map((r) => `      · ${r.title} (${r.price ?? '?'})`)
        .join('\n');
      review.push(
        `${product.name} @ ${provider.id}: ${confident.length || results.length} candidates, attach manually` +
          (top ? `\n${top}` : ''),
      );
    }
  }
}

console.log(`\n[auto-match] attached ${attached} links`);
if (review.length) {
  console.log('\nNeeds manual review (use the AddProduct / product-page search UI):');
  for (const line of review) console.log(`  - ${line}`);
}
await runCleanup(ctx);
db.close();
