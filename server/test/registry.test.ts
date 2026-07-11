import { afterEach, describe, expect, it } from 'vitest';
import { getProvider, getProviders, isKnownProvider } from '../src/providers/registry.js';

const ENV_KEYS = ['FETCH_PROVIDERS', 'SKIP_PROVIDERS', 'CI'] as const;
const saved = ENV_KEYS.map((k) => [k, process.env[k]] as const);

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function ids(): string[] {
  return getProviders().map((p) => p.id);
}

describe('provider registry filtering', () => {
  it('enables all shops by default (outside CI; Playwright installed)', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    expect(ids()).toEqual(['redman', 'bakeking', 'fairprice', 'bakewithyen', 'shengsiong', 'coldstorage']);
  });

  it('drops residential-only providers in CI (leaving only datacenter-safe ones)', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.CI = 'true';
    expect(ids()).toEqual(['redman', 'bakeking', 'fairprice']);
    for (const id of ['bakewithyen', 'shengsiong', 'coldstorage']) {
      expect(getProvider(id)).toBeUndefined();
      expect(isKnownProvider(id)).toBe(true); // known → fetcher skips silently
    }
  });

  it('SKIP_PROVIDERS denylists by id', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.SKIP_PROVIDERS = 'bakewithyen, fairprice, shengsiong, coldstorage';
    expect(ids()).toEqual(['redman', 'bakeking']);
  });

  it('FETCH_PROVIDERS allowlist wins over everything', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.CI = 'true';
    process.env.SKIP_PROVIDERS = 'redman';
    process.env.FETCH_PROVIDERS = 'redman,bakewithyen';
    expect(ids()).toEqual(['redman', 'bakewithyen']);
  });

  it('unknown ids are not known providers', () => {
    expect(isKnownProvider('giant')).toBe(false);
    expect(isKnownProvider('lazada')).toBe(false);
  });
});
