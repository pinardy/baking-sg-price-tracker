import { describe, expect, it } from 'vitest';
import { fetchSgdRates } from '../src/services/fx.js';
import { fakeCtx } from './helpers.js';

const ratesBody = JSON.stringify({
  amount: 1,
  base: 'SGD',
  date: '2026-07-06',
  rates: { USD: 0.77311, EUR: 0.67728 },
});

describe('fetchSgdRates', () => {
  it('inverts API rates to SGD-per-unit', async () => {
    const { fetch } = fakeCtx({ 'api.frankfurter.dev': ratesBody });
    const rates = await fetchSgdRates(fetch, ['USD', 'EUR']);
    expect(rates?.USD).toBeCloseTo(1.2935, 3);
    expect(rates?.EUR).toBeCloseTo(1.4765, 3);
  });

  it('skips currencies missing from the response', async () => {
    const { fetch } = fakeCtx({ 'api.frankfurter.dev': ratesBody });
    const rates = await fetchSgdRates(fetch, ['USD', 'XYZ']);
    expect(rates?.USD).toBeDefined();
    expect(rates?.XYZ).toBeUndefined();
  });

  it('returns empty object when only SGD requested (no call needed)', async () => {
    const { fetch } = fakeCtx({});
    expect(await fetchSgdRates(fetch, ['SGD'])).toEqual({});
  });

  it('returns null on HTTP failure', async () => {
    const { fetch } = fakeCtx({ 'api.frankfurter.dev': { status: 500 } });
    expect(await fetchSgdRates(fetch, ['USD'])).toBeNull();
  });
});
