import { describe, expect, it } from 'vitest';
import { BakeWithYenProvider, firstJsonLdProduct } from '../../src/providers/bakewithyen.js';
import { fakeCtx, fixture } from '../helpers.js';

const provider = new BakeWithYenProvider();
const productHtml = fixture('bakewithyen-product.html');

const link = {
  providerId: 'bakewithyen',
  externalId: 'conaprole-butter-unsalted-200g',
  variantId: null,
  query: null,
  url: 'https://www.bakewithyen.sg/product/conaprole-butter-unsalted-200g',
};

describe('BakeWithYenProvider.fetchPrice', () => {
  it('parses JSON-LD price, availability, and title-parsed pack size', async () => {
    const ctx = fakeCtx({ '/product/conaprole-butter-unsalted-200g': productHtml });
    const result = await provider.fetchPrice(link, ctx);
    expect(result.price).toBe(3.15);
    expect(result.currency).toBe('SGD');
    expect(result.inStock).toBe(true);
    expect(result.title).toContain('CONAPROLE BUTTER UNSALTED 200G');
    expect(result.packSize).toEqual({ qty: 200, unit: 'g' });
    expect(result.packSource).toBe('parsed');
  });

  it('explains the Cloudflare block on 403', async () => {
    const ctx = fakeCtx({ '/product/conaprole-butter-unsalted-200g': { status: 403 } });
    await expect(provider.fetchPrice(link, ctx)).rejects.toThrow(/residential/);
  });

  it('throws when the page has no JSON-LD product', async () => {
    const ctx = fakeCtx({ '/product/conaprole-butter-unsalted-200g': '<html><body>shell</body></html>' });
    await expect(provider.fetchPrice(link, ctx)).rejects.toThrow(/no JSON-LD/);
  });
});

describe('BakeWithYenProvider.search', () => {
  it('treats a pasted product URL as a direct lookup', async () => {
    const ctx = fakeCtx({ '/product/conaprole-butter-unsalted-200g': productHtml });
    const results = await provider.search(
      'https://www.bakewithyen.sg/product/conaprole-butter-unsalted-200g',
      ctx,
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      providerId: 'bakewithyen',
      externalId: 'conaprole-butter-unsalted-200g',
      price: 3.15,
      currency: 'SGD',
      packQty: 200,
      packUnit: 'g',
    });
  });

  it('degrades to no matches when the search page is unavailable', async () => {
    const ctx = fakeCtx({ '/product/search': { status: 403 } });
    expect(await provider.search('butter', ctx)).toEqual([]);
  });

  it('merges the anchor group per result (badge, title, price strip) and filters carousels', async () => {
    // Real shape: each search hit renders several anchors on the same slug.
    const page = `<html><body>
      <a href="/product/conaprole-butter-unsalted-200g-exp-2026-12-18">21% off</a>
      <a href="/product/conaprole-butter-unsalted-200g-exp-2026-12-18">CONAPROLE BUTTER UNSALTED 200G (EXP 2026-12-18)</a>
      <a href="/product/conaprole-butter-unsalted-200g-exp-2026-12-18">$4.00$3.15$3.15$4.00-21%</a>
      <a href="https://www.bakewithyen.sg/product/anchor-butter-5kg">ANCHOR BUTTER 5KG</a>
      <a href="https://www.bakewithyen.sg/product/anchor-butter-5kg">$62.00$62.00</a>
      <a href="/product/marina-tuna-mayonnaise-185g">MARINA TUNA MAYONNAISE 185G</a>
      <a href="/shop/about">not a product</a>
    </body></html>`;
    const ctx = fakeCtx({ '/product/search': page });
    const results = await provider.search('butter', ctx);
    // The tuna carousel item doesn't mention "butter" and is filtered out.
    expect(results.map((r) => r.externalId)).toEqual([
      'conaprole-butter-unsalted-200g-exp-2026-12-18',
      'anchor-butter-5kg',
    ]);
    expect(results[0]).toMatchObject({
      title: 'CONAPROLE BUTTER UNSALTED 200G (EXP 2026-12-18)',
      price: 3.15, // discounted price = min of the price strip
      packQty: 200,
      packUnit: 'g',
    });
    expect(results[1]).toMatchObject({ price: 62, packQty: 5, packUnit: 'kg' });
  });
});

describe('firstJsonLdProduct RSC fallback', () => {
  it('finds a schema.org product embedded outside script tags', () => {
    const html = `<html><body><div>self.__next_f.push([1,"…{\\"x\\":1}…"])</div>
      {"@context":"https://schema.org","@type":"Product","name":"BREAD FLOUR 1KG","offers":{"@type":"Offer","price":"2.10","priceCurrency":"SGD"}}
    </body></html>`;
    const product = firstJsonLdProduct(html);
    expect(product?.name).toBe('BREAD FLOUR 1KG');
  });
});
