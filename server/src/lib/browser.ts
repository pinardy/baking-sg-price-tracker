import { createRequire } from 'node:module';
import type { FetchContext } from '../providers/types.js';

// Headless-browser support for the client-rendered shops (Sheng Siong,
// Cold Storage). Playwright is an optional dependency: if it (or its browser
// binary) is missing, isPlaywrightAvailable() is false and those providers
// disable themselves, so the rest of the app keeps working.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BROWSER_KEY = '__playwright_browser__';

let available: boolean | null = null;

/** Cheap sync check (no launch) — safe to call from a provider's enabled(). */
export function isPlaywrightAvailable(): boolean {
  if (available !== null) return available;
  try {
    createRequire(import.meta.url).resolve('playwright');
    available = true;
  } catch {
    available = false;
  }
  return available;
}

/** One browser context per fetch/search run, cached and torn down via ctx.cleanup. */
async function getContext(ctx: FetchContext): Promise<any> {
  const cached = ctx.cache.get(BROWSER_KEY) as { context: any } | undefined;
  if (cached) return cached.context;
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: UA, locale: 'en-SG' });
  context.setDefaultNavigationTimeout(45_000);
  ctx.cache.set(BROWSER_KEY, { context });
  (ctx.cleanup ??= []).push(async () => {
    await browser.close().catch(() => {});
  });
  return context;
}

/** Runs `fn` with a fresh page on the shared browser context, always closing the page. */
export async function withPage<T>(ctx: FetchContext, fn: (page: any) => Promise<T>): Promise<T> {
  const context = await getContext(ctx);
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

/** Runs any registered teardown callbacks (browser close, etc.). Never throws. */
export async function runCleanup(ctx: FetchContext): Promise<void> {
  const tasks = ctx.cleanup ?? [];
  ctx.cleanup = [];
  for (const task of tasks) {
    try {
      await task();
    } catch {
      /* ignore teardown errors */
    }
  }
}
