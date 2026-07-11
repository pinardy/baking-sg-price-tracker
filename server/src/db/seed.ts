import { db } from './connection.js';
import { migrate } from './migrate.js';

// Common baking staples, products only — shop links are attached afterwards
// via the AddProduct/ProductDetail search UI (or `npm run auto-match` for a
// best-effort first pass), since listing ids can't be known without live
// searches against each shop.
type Category =
  | 'flour'
  | 'sugar'
  | 'dairy'
  | 'eggs'
  | 'leavening'
  | 'chocolate-cocoa'
  | 'nuts-seeds'
  | 'flavoring'
  | 'other';

const SEED: { name: string; category: Category; variant_desc?: string }[] = [
  { name: 'Plain Flour', category: 'flour' },
  { name: 'Bread Flour', category: 'flour' },
  { name: 'Cake Flour', category: 'flour', variant_desc: 'e.g. Prima Top Flour' },
  { name: 'Caster Sugar', category: 'sugar' },
  { name: 'Brown Sugar', category: 'sugar' },
  { name: 'Icing Sugar', category: 'sugar' },
  { name: 'Unsalted Butter', category: 'dairy', variant_desc: 'block, e.g. SCS/Anchor' },
  { name: 'Salted Butter', category: 'dairy' },
  { name: 'Whipping Cream', category: 'dairy', variant_desc: 'dairy, ~1L' },
  { name: 'Full Cream Milk (UHT)', category: 'dairy' },
  { name: 'Condensed Milk', category: 'dairy' },
  { name: 'Cream Cheese', category: 'dairy' },
  { name: 'Fresh Eggs', category: 'eggs', variant_desc: 'compare per piece across tray sizes' },
  { name: 'Instant Dry Yeast', category: 'leavening' },
  { name: 'Baking Powder', category: 'leavening' },
  { name: 'Baking Soda', category: 'leavening' },
  { name: 'Cocoa Powder', category: 'chocolate-cocoa' },
  { name: 'Dark Chocolate Chips', category: 'chocolate-cocoa' },
  { name: 'Almond Flour', category: 'nuts-seeds', variant_desc: 'ground almond' },
  { name: 'Vanilla Extract', category: 'flavoring' },
  { name: 'Cornstarch', category: 'other' },
];

migrate();

const insertProduct = db.prepare(
  `INSERT INTO products (name, category, variant_desc, target_currency)
   VALUES (?, ?, ?, 'SGD')`,
);
const findProduct = db.prepare('SELECT id FROM products WHERE name = ?');

let added = 0;
db.transaction(() => {
  for (const item of SEED) {
    if (findProduct.get(item.name)) continue;
    insertProduct.run(item.name, item.category, item.variant_desc ?? null);
    added++;
  }
})();

console.log(`[seed] added ${added} products (${SEED.length} in catalog)`);
