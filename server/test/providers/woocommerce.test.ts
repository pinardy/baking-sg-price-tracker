import { describe, expect, it } from 'vitest';
import { WooCommerceProvider } from '../../src/providers/woocommerce.js';
import { fakeCtx, fixture } from '../helpers.js';

const bakeking = new WooCommerceProvider('bakeking', 'Bake King', 'https://bakeking.com.sg', 'SGD');

describe('Store API search (Bake King fixture)', () => {
  it('converts minor-unit prices and expands variable products into variations', async () => {
    const ctx = fakeCtx({
      'type=variation&parent=501': fixture('bakeking-variations.json'),
      'bakeking.com.sg/wp-json/wc/store/v1/products': fixture('bakeking-storeapi.json'),
    });
    const results = await bakeking.search('flour', ctx);

    // Variable parent (501) reports the range minimum — the trap; only the
    // variation rows (511/512) should appear, each with the true price.
    expect(results.some((r) => r.externalId === '501')).toBe(false);
    const oneKg = results.find((r) => r.title.includes('1kg'));
    const fiveKg = results.find((r) => r.title.includes('5kg'));
    expect(oneKg).toMatchObject({ externalId: '511', price: 2.6, currency: 'SGD' });
    expect(fiveKg).toMatchObject({ externalId: '512', price: 10.9, currency: 'SGD' });

    const sugar = results.find((r) => r.externalId === '502');
    expect(sugar).toMatchObject({ price: 1.55, currency: 'SGD' });
  });

  it('fetchPrice on a variation id returns the variant price and stock', async () => {
    const variation = JSON.stringify({
      id: 512,
      name: 'Bake King Bread Flour',
      variation: 'Size: 5kg',
      is_in_stock: true,
      prices: { price: '1090', currency_code: 'SGD', currency_minor_unit: 2 },
    });
    const ctx = fakeCtx({
      '/wp-json/wc/store/v1/products/512': variation,
      'bakeking.com.sg/wp-json/wc/store/v1/products': '[]',
    });
    const result = await bakeking.fetchPrice(
      { providerId: 'bakeking', externalId: '512', variantId: null, query: null, url: 'https://bakeking.com.sg/product/x' },
      ctx,
    );
    expect(result.price).toBe(10.9);
    expect(result.currency).toBe('SGD');
    expect(result.inStock).toBe(true);
    expect(result.title).toContain('Size: 5kg');
  });
});

describe('JSON-LD fallback', () => {
  const link = (url: string) => ({ providerId: 'x', externalId: null, variantId: null, query: null, url });

  it('handles @graph with priceSpecification arrays', async () => {
    const page = `<html><head><script type="application/ld+json">
      {"@graph":[{"@type":"Product","name":"Test Flour 1kg","offers":[{"@type":"Offer",
        "priceSpecification":[{"price":"2.60","priceCurrency":"SGD"}],
        "availability":"https://schema.org/InStock"}]}]}
    </script></head><body></body></html>`;
    const ctx = fakeCtx({
      'example.com/wp-json': { status: 404 },
      'example.com/product/test': page,
    });
    const provider = new WooCommerceProvider('test', 'Test', 'https://example.com', 'SGD');
    const result = await provider.fetchPrice(link('https://example.com/product/test'), ctx);
    expect(result.price).toBe(2.6);
    expect(result.currency).toBe('SGD');
    expect(result.inStock).toBe(true);
  });

  it('picks the in-stock lowest variant from a ProductGroup', async () => {
    const page = `<html><head><script type="application/ld+json">
      {"@type":"ProductGroup","name":"Bread Flour","hasVariant":[
        {"@type":"Product","name":"Bread Flour — 1kg","offers":{"@type":"Offer","price":"2.60","priceCurrency":"SGD","availability":"https://schema.org/OutOfStock"}},
        {"@type":"Product","name":"Bread Flour — 5kg","offers":{"@type":"Offer","price":"10.90","priceCurrency":"SGD","availability":"https://schema.org/InStock"}}
      ]}
    </script></head><body></body></html>`;
    const ctx = fakeCtx({
      'example.com/wp-json': { status: 404 },
      'example.com/product/bread-flour': page,
    });
    const provider = new WooCommerceProvider('test', 'Test', 'https://example.com', 'SGD');
    const result = await provider.fetchPrice(link('https://example.com/product/bread-flour'), ctx);
    expect(result.title).toContain('5kg'); // in-stock beats cheaper out-of-stock
    expect(result.inStock).toBe(true);
  });

  it('throws when no JSON-LD product exists', async () => {
    const ctx = fakeCtx({
      'bakeking.com.sg/wp-json/wc/store/v1/products': { status: 404 },
      '/product/flour': '<html><body>no structured data</body></html>',
    });
    await expect(
      bakeking.fetchPrice(link('https://bakeking.com.sg/product/flour'), ctx),
    ).rejects.toThrow(/no JSON-LD/);
  });
});
