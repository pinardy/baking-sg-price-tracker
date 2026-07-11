import { describe, expect, it } from 'vitest';
import { ShopifyProvider } from '../../src/providers/shopify.js';
import { fakeCtx, fixture } from '../helpers.js';

const provider = new ShopifyProvider('redman', 'RedMan (Phoon Huat)', 'https://shop.redmanshop.com', 'SGD');
const productJs = fixture('redman-product.json');

const link = {
  providerId: 'redman',
  externalId: '000000000000001242',
  variantId: '40001112223334',
  query: null,
  url: 'https://shop.redmanshop.com/products/000000000000001242',
};

describe('ShopifyProvider.fetchPrice (RedMan)', () => {
  it('extracts the chosen variant price in dollars with availability', async () => {
    const ctx = fakeCtx({ '/products/000000000000001242.js': productJs });
    const result = await provider.fetchPrice(link, ctx);
    expect(result.price).toBe(2.8);
    expect(result.currency).toBe('SGD');
    expect(result.inStock).toBe(true);
    expect(result.title).toContain('PLAIN FLOUR UNBLEACHED 1KG');
  });

  it('throws when the variant has disappeared', async () => {
    const ctx = fakeCtx({ '/products/000000000000001242.js': productJs });
    await expect(
      provider.fetchPrice({ ...link, variantId: '999999' }, ctx),
    ).rejects.toThrow(/variant 999999 gone/);
  });

  it('throws on HTTP errors', async () => {
    const ctx = fakeCtx({ '/products/000000000000001242.js': { status: 500 } });
    await expect(provider.fetchPrice(link, ctx)).rejects.toThrow(/HTTP 500/);
  });

  it('throws on malformed body', async () => {
    const ctx = fakeCtx({ '/products/000000000000001242.js': '{"title":"x"}' });
    await expect(provider.fetchPrice(link, ctx)).rejects.toThrow(/no variants/);
  });
});

describe('ShopifyProvider.search (RedMan)', () => {
  it('expands suggestions into per-variant results', async () => {
    const suggest = JSON.stringify({
      resources: {
        results: {
          products: [
            { handle: '000000000000001242', title: 'PLAIN FLOUR UNBLEACHED 1KG (#1242)', price: '2.80' },
          ],
        },
      },
    });
    const ctx = fakeCtx({
      '/search/suggest.json': suggest,
      '/products/000000000000001242.js': productJs,
    });
    const results = await provider.search('plain flour', ctx);
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({
      providerId: 'redman',
      externalId: '000000000000001242',
      price: 2.8,
      currency: 'SGD',
    });
    expect(results[0].variantId).toBeTruthy();
  });
});
