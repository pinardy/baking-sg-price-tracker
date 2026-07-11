import 'dotenv/config';
import { db } from '../db/connection.js';
import { migrate } from '../db/migrate.js';
import { runFetch } from '../services/fetcher.js';

// One fetch run for CI. The TRUNCATE checkpoint folds the WAL into app.db so
// the committed file is self-contained.
migrate();
const runId = await runFetch('cron');
if (runId == null) {
  console.error('[fetch-once] a fetch was already running');
  process.exit(1);
}
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
console.log('[fetch-once] done');
