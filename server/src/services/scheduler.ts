import cron from 'node-cron';
import { db } from '../db/connection.js';
import { runFetch } from './fetcher.js';

const STALE_HOURS = 20;
const STARTUP_DELAY_MS = 10_000;

export function startScheduler(): { cronExpr: string } {
  const cronExpr = process.env.FETCH_CRON || '0 8 * * *';
  cron.schedule(cronExpr, () => {
    runFetch('cron').catch((err) => console.error('[scheduler] cron run failed', err));
  });

  // The machine may have been asleep through the cron slot — catch up on boot.
  setTimeout(() => {
    const last = db
      .prepare(
        `SELECT finished_at FROM fetch_runs
         WHERE finished_at IS NOT NULL
           AND finished_at > datetime('now', ?)
         ORDER BY id DESC LIMIT 1`,
      )
      .get(`-${STALE_HOURS} hours`);
    if (!last) {
      console.log(`[scheduler] no fetch in the last ${STALE_HOURS}h, running startup fetch`);
      runFetch('startup').catch((err) => console.error('[scheduler] startup run failed', err));
    }
  }, STARTUP_DELAY_MS);

  return { cronExpr };
}
