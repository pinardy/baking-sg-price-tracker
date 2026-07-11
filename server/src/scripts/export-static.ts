import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../db/migrate.js';
import { getEnabledProviders, getLastRun } from '../services/fetcher.js';
import { getHistory, getProduct, listAlerts, listProducts } from '../services/queries.js';

// Exports the read API as JSON files for the static (GitHub Pages) build.
// The client's static mode fetches these instead of hitting /api.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const outDir = process.env.OUT_DIR ?? path.join(repoRoot, 'client', 'public', 'data');

migrate();

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'products'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'history'), { recursive: true });

const write = (relPath: string, data: unknown) =>
  fs.writeFileSync(path.join(outDir, relPath), JSON.stringify(data));

const products = listProducts();
write('products.json', products);
for (const product of products) {
  write(`products/${product.id}.json`, getProduct(product.id));
  write(`history/${product.id}.json`, getHistory(product.id, 365));
}
write('alerts.json', listAlerts(false));
write('status.json', { running: false, lastRun: getLastRun() });
write('providers.json', getEnabledProviders());

console.log(`[export-static] wrote ${products.length} products to ${outDir}`);
