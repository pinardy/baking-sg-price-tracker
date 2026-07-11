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
  it('enables all four shops by default (outside CI)', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    expect(ids()).toEqual(['redman', 'bakeking', 'fairprice', 'bakewithyen']);
  });

  it('drops residential-only providers in CI', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.CI = 'true';
    expect(ids()).toEqual(['redman', 'bakeking', 'fairprice']);
    expect(getProvider('bakewithyen')).toBeUndefined();
    expect(isKnownProvider('bakewithyen')).toBe(true); // known → fetcher skips silently
  });

  it('SKIP_PROVIDERS denylists by id', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.SKIP_PROVIDERS = 'bakewithyen, fairprice';
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
    expect(isKnownProvider('shengsiong')).toBe(false);
  });
});
