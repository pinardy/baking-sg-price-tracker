#!/usr/bin/env node
// Local full refresh: scrape ALL providers (including Bake With Yen, which
// only works from a residential IP), commit the updated DB, push, and
// trigger the Pages rebuild so the PWA serves fresh data immediately.
//
// Always use this instead of hand-committing server/data/app.db — app.db is
// binary, so the pull-first ordering here is what keeps it conflict-free
// against the daily GitHub Actions snapshot commits.
import { execSync } from 'node:child_process';

const run = (cmd, opts = {}) => {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', ...opts });
};
const capture = (cmd) => execSync(cmd, { encoding: 'utf-8' }).trim();

// 1. Sync with the bot's daily commits BEFORE fetching, so our commit lands on top.
run('git pull --rebase --autostash');

// 2. Fetch all providers (CI is unset locally, so nothing is filtered).
run('npm run fetch:once -w server');

// 3. Commit the DB if it changed.
const dirty = capture('git status --porcelain -- server/data/app.db');
if (!dirty) {
  console.log('\nNo price changes to commit.');
  process.exit(0);
}
run('git add server/data/app.db');
run('git commit -m "chore: local price snapshot (incl. Bake With Yen)"');

// 4. Push; one pull-rebase retry in case the daily workflow raced us.
try {
  run('git push');
} catch {
  console.log('\nPush rejected — rebasing onto the remote and retrying once…');
  run('git pull --rebase');
  run('git push');
}

// 5. Rebuild Pages now instead of waiting for tomorrow's cron.
try {
  run('gh workflow run pages.yml');
  console.log('\nPages rebuild triggered.');
} catch {
  console.log(
    '\nCould not trigger the workflow (is the GitHub CLI installed and authed?).' +
      '\nTrigger it manually: repo → Actions → "Fetch prices and deploy Pages" → Run workflow.',
  );
}
