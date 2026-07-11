import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FetchContext } from '../src/providers/types.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function fixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf-8');
}

/**
 * FetchContext whose fetch resolves URLs against a substring → body map.
 * Unmatched URLs get a 404.
 */
export function fakeCtx(routes: Record<string, string | { status: number; body?: string }>): FetchContext {
  return {
    cache: new Map(),
    fetch: async (url: string) => {
      for (const [pattern, entry] of Object.entries(routes)) {
        if (!url.includes(pattern)) continue;
        const { status, body } = typeof entry === 'string' ? { status: 200, body: entry } : entry;
        return new Response(body ?? '', {
          status,
          headers: { 'content-type': inferContentType(body) },
        });
      }
      return new Response('not found', { status: 404 });
    },
  };
}

function inferContentType(body?: string): string {
  if (!body) return 'text/plain';
  const trimmed = body.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[') ? 'application/json' : 'text/html';
}
