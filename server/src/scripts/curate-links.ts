import 'dotenv/config';
import { db } from '../db/connection.js';
import { migrate } from '../db/migrate.js';
import { parsePackSize } from '../lib/packSize.js';
import { runCleanup } from '../lib/browser.js';
import { createPoliteFetch } from '../lib/politeFetch.js';
import { getProvider } from '../providers/registry.js';
import type { FetchContext, SearchResult } from '../providers/types.js';

// One-off curated link seeding (run 2026-07-11): for each rule, search the
// shop and attach the cheapest result whose title contains every `must`
// token and none of the `avoid` tokens. The token choices encode manual
// review of live search results — rerun after wiping links to rebuild the
// starter catalog, and adjust tokens when a shop renames a listing.
interface Rule {
  product: string;
  provider: string;
  query?: string;
  must: string[];
  avoid?: string[];
}

const RULES: Rule[] = [
  { product: 'Plain Flour', provider: 'redman', must: ['plain flour', '1kg'] },
  { product: 'Plain Flour', provider: 'bakeking', must: ['plain flour', 'weight: 1kg'] },
  { product: 'Plain Flour', provider: 'fairprice', must: ['prima', 'plain'] },
  { product: 'Plain Flour', provider: 'bakewithyen', must: ['plain flour 1kg'], avoid: ['ctn', 'piece x'] },

  { product: 'Bread Flour', provider: 'redman', must: ['bread flour', '1kg'], avoid: ['wholemeal'] },
  { product: 'Bread Flour', provider: 'bakeking', must: ['bread flour', 'weight: 1kg'] },
  { product: 'Bread Flour', provider: 'fairprice', must: ['bread flour'], avoid: ['wholemeal', 'mix'] },
  { product: 'Bread Flour', provider: 'bakewithyen', must: ['bread flour'], avoid: ['ctn', 'piece x', 'wholemeal'] },

  { product: 'Cake Flour', provider: 'redman', must: ['cake flour'] },
  { product: 'Cake Flour', provider: 'bakeking', must: ['cake flour'] },
  { product: 'Cake Flour', provider: 'fairprice', query: 'top flour', must: ['top flour'] },
  { product: 'Cake Flour', provider: 'bakewithyen', must: ['cake flour'], avoid: ['ctn', 'piece x'] },

  { product: 'Caster Sugar', provider: 'redman', must: ['caster sugar'] },
  { product: 'Caster Sugar', provider: 'bakeking', must: ['caster sugar'] },
  { product: 'Caster Sugar', provider: 'fairprice', must: ['caster sugar'] },
  { product: 'Caster Sugar', provider: 'bakewithyen', must: ['caster sugar'], avoid: ['ctn', 'piece x'] },

  { product: 'Brown Sugar', provider: 'redman', must: ['brown sugar'] },
  { product: 'Brown Sugar', provider: 'bakeking', must: ['brown sugar'] },
  { product: 'Brown Sugar', provider: 'fairprice', must: ['brown sugar'] },
  { product: 'Brown Sugar', provider: 'bakewithyen', must: ['brown sugar'], avoid: ['ctn', 'piece x'] },

  { product: 'Icing Sugar', provider: 'redman', must: ['icing sugar'] },
  { product: 'Icing Sugar', provider: 'bakeking', must: ['icing sugar'] },
  { product: 'Icing Sugar', provider: 'fairprice', must: ['icing sugar'] },
  { product: 'Icing Sugar', provider: 'bakewithyen', must: ['icing sugar'], avoid: ['ctn', 'piece x'] },

  { product: 'Unsalted Butter', provider: 'redman', must: ['butter', 'unsalted'] },
  { product: 'Unsalted Butter', provider: 'fairprice', must: ['butter', 'unsalted'], avoid: ['spread'] },
  { product: 'Unsalted Butter', provider: 'bakewithyen', must: ['butter', 'unsalted'], avoid: ['ctn', 'pcs x'] },

  { product: 'Salted Butter', provider: 'redman', must: ['butter', 'salted'], avoid: ['unsalted'] },
  { product: 'Salted Butter', provider: 'fairprice', must: ['butter', 'salted'], avoid: ['unsalted', 'spread'] },
  { product: 'Salted Butter', provider: 'bakewithyen', must: ['butter', 'salted'], avoid: ['unsalted', 'ctn', 'pcs x'] },

  { product: 'Whipping Cream', provider: 'redman', must: ['whipping cream'] },
  { product: 'Whipping Cream', provider: 'fairprice', must: ['whipping cream'] },
  { product: 'Whipping Cream', provider: 'bakewithyen', must: ['whipping'], avoid: ['ctn', 'pcs x'] },

  { product: 'Full Cream Milk (UHT)', provider: 'fairprice', query: 'uht milk full cream', must: ['uht', 'milk'] },
  { product: 'Full Cream Milk (UHT)', provider: 'bakewithyen', query: 'uht milk', must: ['milk'], avoid: ['ctn', 'pcs x'] },

  { product: 'Condensed Milk', provider: 'fairprice', must: ['condensed milk'] },
  { product: 'Condensed Milk', provider: 'bakewithyen', must: ['condensed'], avoid: ['ctn', 'pcs x'] },

  { product: 'Cream Cheese', provider: 'redman', must: ['cream cheese'] },
  { product: 'Cream Cheese', provider: 'fairprice', must: ['cream cheese'], avoid: ['spread'] },
  { product: 'Cream Cheese', provider: 'bakewithyen', must: ['cream cheese'], avoid: ['ctn', 'pcs x'] },

  { product: 'Fresh Eggs', provider: 'fairprice', must: ['fresh eggs'] },

  { product: 'Instant Dry Yeast', provider: 'redman', query: 'instant yeast', must: ['yeast'] },
  { product: 'Instant Dry Yeast', provider: 'bakeking', query: 'instant yeast', must: ['yeast'] },
  { product: 'Instant Dry Yeast', provider: 'fairprice', query: 'instant yeast', must: ['yeast'] },
  { product: 'Instant Dry Yeast', provider: 'bakewithyen', query: 'instant yeast', must: ['yeast'], avoid: ['ctn', 'pcs x'] },

  { product: 'Baking Powder', provider: 'redman', must: ['baking powder'] },
  { product: 'Baking Powder', provider: 'bakeking', must: ['baking powder'] },
  { product: 'Baking Powder', provider: 'fairprice', must: ['baking powder'] },

  { product: 'Baking Soda', provider: 'redman', must: ['baking soda'] },
  { product: 'Baking Soda', provider: 'bakeking', query: 'bicarbonate soda', must: ['soda'] },
  { product: 'Baking Soda', provider: 'fairprice', must: ['baking soda'] },
  { product: 'Baking Soda', provider: 'bakewithyen', query: 'baking soda', must: ['soda'], avoid: ['ctn', 'pcs x'] },

  { product: 'Cocoa Powder', provider: 'redman', must: ['cocoa powder'] },
  { product: 'Cocoa Powder', provider: 'fairprice', must: ['cocoa powder'] },
  { product: 'Cocoa Powder', provider: 'bakewithyen', must: ['cocoa powder'], avoid: ['ctn', 'pcs x'] },

  { product: 'Dark Chocolate Chips', provider: 'redman', query: 'dark chocolate chips', must: ['chocolate chips', 'dark'] },
  { product: 'Dark Chocolate Chips', provider: 'bakewithyen', query: 'dark chocolate chips', must: ['dark compound chocolate chips', '1kg'] },

  { product: 'Almond Flour', provider: 'redman', query: 'almond flour', must: ['almond flour', 'blanched'] },
  { product: 'Almond Flour', provider: 'fairprice', query: 'almond flour', must: ['almond flour'] },
  { product: 'Almond Flour', provider: 'bakewithyen', query: 'almond ground', must: ['almond ground', '1kg'], avoid: ['11.34'] },

  { product: 'Vanilla Extract', provider: 'redman', must: ['vanilla extract'] },
  { product: 'Vanilla Extract', provider: 'bakeking', must: ['vanilla extract'], avoid: ['imitation'] },
  { product: 'Vanilla Extract', provider: 'bakewithyen', must: ['vanilla extract'], avoid: ['1kg'] },

  { product: 'Cornstarch', provider: 'redman', must: ['cornstarch'] },
  { product: 'Cornstarch', provider: 'fairprice', query: 'corn flour', must: ['corn flour'] },

  // Sheng Siong (headless; matched by re-search on the stored query).
  { product: 'Plain Flour', provider: 'shengsiong', query: 'plain flour', must: ['plain flour'] },
  { product: 'Bread Flour', provider: 'shengsiong', query: 'bread flour', must: ['bread flour'], avoid: ['wholemeal'] },
  { product: 'Cake Flour', provider: 'shengsiong', query: 'cake flour', must: ['cake flour'] },
  { product: 'Caster Sugar', provider: 'shengsiong', query: 'caster sugar', must: ['caster sugar'] },
  { product: 'Brown Sugar', provider: 'shengsiong', query: 'brown sugar', must: ['brown sugar'], avoid: ['soy', 'milk', 'drink'] },
  { product: 'Icing Sugar', provider: 'shengsiong', query: 'icing sugar', must: ['icing sugar'] },
  { product: 'Unsalted Butter', provider: 'shengsiong', query: 'unsalted butter', must: ['butter', 'unsalted'], avoid: ['spread', 'blend', 'margarine'] },
  { product: 'Salted Butter', provider: 'shengsiong', query: 'salted butter', must: ['butter', 'salted'], avoid: ['unsalted', 'spread', 'blend', 'margarine'] },
  { product: 'Full Cream Milk (UHT)', provider: 'shengsiong', query: 'uht full cream milk', must: ['milk'] },
  { product: 'Condensed Milk', provider: 'shengsiong', query: 'condensed milk', must: ['condensed'] },
  { product: 'Fresh Eggs', provider: 'shengsiong', query: 'fresh eggs', must: ['eggs'], avoid: ['quail', 'century', 'salted', 'tart', 'cake', 'roll'] },
  { product: 'Instant Dry Yeast', provider: 'shengsiong', query: 'instant yeast', must: ['yeast'] },
  { product: 'Baking Powder', provider: 'shengsiong', query: 'baking powder', must: ['baking powder'] },
  { product: 'Baking Soda', provider: 'shengsiong', query: 'baking soda', must: ['soda'] },
  { product: 'Cocoa Powder', provider: 'shengsiong', query: 'cocoa powder', must: ['cocoa'] },
  { product: 'Cornstarch', provider: 'shengsiong', query: 'corn flour', must: ['corn flour'] },

  // Cold Storage (headless; stable /product/<slug> URLs).
  { product: 'Plain Flour', provider: 'coldstorage', query: 'plain flour', must: ['plain flour'], avoid: ['plus', 'wholegrain'] },
  { product: 'Bread Flour', provider: 'coldstorage', query: 'bread flour', must: ['bread flour'], avoid: ['wholemeal'] },
  { product: 'Cake Flour', provider: 'coldstorage', query: 'cake flour', must: ['cake flour'] },
  { product: 'Caster Sugar', provider: 'coldstorage', query: 'caster sugar', must: ['caster sugar'] },
  { product: 'Brown Sugar', provider: 'coldstorage', query: 'brown sugar', must: ['brown sugar'] },
  { product: 'Icing Sugar', provider: 'coldstorage', query: 'icing sugar', must: ['icing sugar'] },
  { product: 'Unsalted Butter', provider: 'coldstorage', query: 'unsalted butter', must: ['butter', 'unsalted'], avoid: ['spread', 'blend', 'margarine'] },
  { product: 'Salted Butter', provider: 'coldstorage', query: 'salted butter', must: ['butter', 'salted'], avoid: ['unsalted', 'spread', 'blend', 'margarine'] },
  { product: 'Whipping Cream', provider: 'coldstorage', query: 'whipping cream', must: ['whipping cream'] },
  { product: 'Full Cream Milk (UHT)', provider: 'coldstorage', query: 'uht milk', must: ['milk'] },
  { product: 'Condensed Milk', provider: 'coldstorage', query: 'condensed milk', must: ['condensed'] },
  { product: 'Fresh Eggs', provider: 'coldstorage', query: 'eggs', must: ['egg'], avoid: ['quail', 'century', 'salted'] },
  { product: 'Baking Powder', provider: 'coldstorage', query: 'baking powder', must: ['baking powder'] },
  { product: 'Cocoa Powder', provider: 'coldstorage', query: 'cocoa powder', must: ['cocoa'] },
  { product: 'Dark Chocolate Chips', provider: 'coldstorage', query: 'dark chocolate chips', must: ['dark', 'chocolate', 'chips'] },
  { product: 'Almond Flour', provider: 'coldstorage', query: 'almond flour', must: ['almond flour'] },
  { product: 'Cornstarch', provider: 'coldstorage', query: 'corn flour', must: ['corn'] },
  { product: 'Vanilla Extract', provider: 'coldstorage', query: 'vanilla extract', must: ['vanilla', 'extract'], avoid: ['imitation'] },
  { product: 'Cocoa Powder', provider: 'shengsiong', query: 'cocoa', must: ['cocoa'] },
];

migrate();

const products = new Map(
  (db.prepare('SELECT id, name FROM products WHERE is_active = 1').all() as { id: number; name: string }[]).map(
    (p) => [p.name, p.id],
  ),
);
const linkExists = db.prepare(
  'SELECT 1 FROM product_links WHERE product_id = ? AND provider_id = ? AND is_active = 1',
);
const insertLink = db.prepare(
  `INSERT INTO product_links (product_id, provider_id, external_id, variant_id, query, url, title,
                              pack_qty, pack_unit, pack_source)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const ctx: FetchContext = { fetch: createPoliteFetch(), cache: new Map(), cleanup: [] };
const searchCache = new Map<string, SearchResult[]>();

async function search(providerId: string, query: string): Promise<SearchResult[]> {
  const key = `${providerId}:${query.toLowerCase()}`;
  if (searchCache.has(key)) return searchCache.get(key)!;
  const provider = getProvider(providerId);
  if (!provider) return [];
  let results: SearchResult[] = [];
  try {
    results = await provider.search(query, ctx);
  } catch (err) {
    console.error(`  search failed for ${providerId} "${query}": ${err instanceof Error ? err.message : err}`);
  }
  searchCache.set(key, results);
  return results;
}

function pick(results: SearchResult[], rule: Rule): SearchResult | null {
  const matches = results.filter((r) => {
    const title = r.title.toLowerCase();
    if (!rule.must.every((t) => title.includes(t))) return false;
    if (rule.avoid?.some((t) => title.includes(t))) return false;
    return true;
  });
  if (!matches.length) return null;
  // Cheapest priced match wins; results with a parsed pack size beat those without.
  return matches.sort((a, b) => {
    const aPack = a.packQty != null ? 0 : 1;
    const bPack = b.packQty != null ? 0 : 1;
    return aPack - bPack || (a.price ?? Infinity) - (b.price ?? Infinity);
  })[0];
}

let attached = 0;
const misses: string[] = [];

for (const rule of RULES) {
  const productId = products.get(rule.product);
  if (!productId) {
    misses.push(`${rule.product}: product not in DB`);
    continue;
  }
  if (linkExists.get(productId, rule.provider)) continue;
  const results = await search(rule.provider, rule.query ?? rule.product);
  const chosen = pick(results, rule);
  if (!chosen) {
    misses.push(`${rule.product} @ ${rule.provider}: no match (must: ${rule.must.join(', ')})`);
    continue;
  }
  const pack =
    chosen.packQty != null && chosen.packUnit
      ? { qty: chosen.packQty, unit: chosen.packUnit }
      : parsePackSize(chosen.title);
  insertLink.run(
    productId,
    rule.provider,
    chosen.externalId,
    chosen.variantId ?? null,
    chosen.query ?? null,
    chosen.url,
    chosen.title,
    pack?.qty ?? null,
    pack?.unit ?? null,
    pack ? 'parsed' : 'none',
  );
  attached++;
  console.log(`OK ${rule.product} @ ${rule.provider}: ${chosen.title} (${chosen.price ?? '?'})`);
}

console.log(`\n[curate-links] attached ${attached} links`);
if (misses.length) {
  console.log('No match (attach via the UI):');
  for (const miss of misses) console.log(`  - ${miss}`);
}
await runCleanup(ctx);
db.close();
