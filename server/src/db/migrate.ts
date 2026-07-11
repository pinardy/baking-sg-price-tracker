import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');

// Sequential migrations; index i produces user_version i + 1.
// schema.sql stays frozen at the v1 shape — fresh DBs replay every step.
const MIGRATIONS: (() => void)[] = [
  // v1: initial schema
  () => db.exec(fs.readFileSync(schemaPath, 'utf-8')),
  // v2: thumbnails + per-link brand identity (populated by fetch runs).
  () =>
    db.exec(`
      ALTER TABLE product_links ADD COLUMN image_url TEXT;
      ALTER TABLE product_links ADD COLUMN brand TEXT;
    `),
];

export function migrate(): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      MIGRATIONS[version]();
      db.pragma(`user_version = ${version + 1}`);
    })();
    console.log(`[db] migrated schema to version ${version + 1}`);
  }
}
