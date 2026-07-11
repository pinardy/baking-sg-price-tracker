import { describe, expect, it } from 'vitest';
import { FairPriceProvider, extractNextData, findProducts } from '../../src/providers/fairprice.js';
import { fakeCtx, fixture } from '../helpers.js';

const provider = new FairPriceProvider();

const link = {
  providerId: 'fairprice',
  externalId: 'prima-plain-flour-1kg-80523',
  variantId: null,
  query: null,
  url: 'https://www.fairprice.com.sg/product/prima-plain-flour-1kg-80523',
};

describe('FairPriceProvider.search', () => {
  it('maps __NEXT_DATA__ products to results with structured pack size', async () => {
    const ctx = fakeCtx({ 'fairprice.com.sg/search': fixture('fairprice-search.html') });
    const results = await provider.search('flour', ctx);
    expect(results).toHaveLength(3);
    // Single-unit promo offer (2.20) beats the regular price (2.84)
    expect(results[0]).toMatchObject({
      providerId: 'fairprice',
      externalId: 'prima-plain-flour-1kg-80523',
      title: 'Prima Flour Packet Flour - Plain',
      price: 2.2,
      currency: 'SGD',
      packQty: 1,
      packUnit: 'kg',
      url: 'https://www.fairprice.com.sg/product/prima-plain-flour-1kg-80523',
    });
    // No offer → final_price
    expect(results[1]).toMatchObject({ externalId: 'fairprice-plain-flour-1kg-13185112', price: 1.98 });
    // "Buy 2 @ $5" is not a unit price → final_price wins
    expect(results[2]).toMatchObject({ externalId: 'multibuy-trap-flour-1kg-555', price: 3.0 });
  });

  it('throws on HTTP errors', async () => {
    const ctx = fakeCtx({ 'fairprice.com.sg/search': { status: 500 } });
    await expect(provider.search('flour', ctx)).rejects.toThrow(/HTTP 500/);
  });
});

describe('FairPriceProvider.fetchPrice', () => {
  it('reads price, availability, and provider pack size from the product page', async () => {
    const ctx = fakeCtx({
      '/product/prima-plain-flour-1kg-80523': fixture('fairprice-product.html'),
    });
    const result = await provider.fetchPrice(link, ctx);
    expect(result.price).toBe(2.2);
    expect(result.currency).toBe('SGD');
    expect(result.inStock).toBe(true); // storeSpecificData[0].stock > 0
    expect(result.title).toBe('Prima Flour Packet Flour - Plain');
    expect(result.packSize).toEqual({ qty: 1, unit: 'kg' });
    expect(result.packSource).toBe('provider');
  });

  it('finds the main product by slug even with recommendation carousels present', async () => {
    const ctx = fakeCtx({
      '/product/prima-plain-flour-1kg-80523': fixture('fairprice-product.html'),
    });
    // The fixture also embeds "Bake King Flours" as a similar-products entry.
    const result = await provider.fetchPrice(link, ctx);
    expect(result.title).toBe('Prima Flour Packet Flour - Plain');
  });

  it('throws when the page has no __NEXT_DATA__', async () => {
    const ctx = fakeCtx({ '/product/prima-plain-flour-1kg-80523': '<html><body>nope</body></html>' });
    await expect(provider.fetchPrice(link, ctx)).rejects.toThrow(/__NEXT_DATA__/);
  });
});

describe('__NEXT_DATA__ helpers', () => {
  it('findProducts dedupes by slug and requires name+slug+price', () => {
    const data = {
      a: [
        { name: 'X', slug: 'x-1', price: 1.5 },
        { name: 'X', slug: 'x-1', price: 1.5 },
        { name: 'no price', slug: 'y-1' },
        { name: 'string price', slug: 'z-1', price: '3.20' },
      ],
    };
    const products = findProducts(data);
    expect(products.map((p) => p.slug)).toEqual(['x-1', 'z-1']);
  });

  it('extractNextData throws a provider error on malformed JSON', () => {
    expect(() =>
      extractNextData('<script id="__NEXT_DATA__" type="application/json">{oops</script>', 'fairprice'),
    ).toThrow(/unparseable/);
  });
});
