import 'dotenv/config';
import { runCleanup } from '../lib/browser.js';
import { createPoliteFetch } from '../lib/politeFetch.js';
import { getProviders } from '../providers/registry.js';
import type { FetchContext, LinkRef } from '../providers/types.js';

// One live search + one live price fetch per enabled provider.
// Respects politeFetch spacing; run manually, not in CI.
// Note: bakewithyen only passes from a residential IP (Cloudflare).
const KNOWN_LINKS: Record<string, LinkRef> = {
  redman: {
    providerId: 'redman',
    externalId: '000000000000001242', // PLAIN FLOUR UNBLEACHED 1KG, verified 2026-07-11
    variantId: null,
    query: null,
    url: 'https://shop.redmanshop.com/products/000000000000001242',
  },
  bakeking: {
    providerId: 'bakeking',
    externalId: null, // resolved during the smoke run from search results
    variantId: null,
    query: null,
    url: '',
  },
  fairprice: {
    providerId: 'fairprice',
    externalId: 'prima-plain-flour-1kg-80523', // verified 2026-07-11
    variantId: null,
    query: null,
    url: 'https://www.fairprice.com.sg/product/prima-plain-flour-1kg-80523',
  },
  bakewithyen: {
    providerId: 'bakewithyen',
    externalId: null, // resolved during the smoke run from search results
    variantId: null,
    query: null,
    url: '',
  },
  shengsiong: {
    providerId: 'shengsiong',
    externalId: null, // resolved from search results (with its stored query)
    variantId: null,
    query: null,
    url: '',
  },
  coldstorage: {
    providerId: 'coldstorage',
    externalId: null, // resolved from search results
    variantId: null,
    query: null,
    url: '',
  },
};

const ctx: FetchContext = { fetch: createPoliteFetch(), cache: new Map(), cleanup: [] };

for (const provider of getProviders()) {
  console.log(`\n=== ${provider.id} (${provider.label}) ===`);
  try {
    const results = await provider.search('plain flour', ctx);
    console.log(`search: ${results.length} results`);
    for (const r of results.slice(0, 3)) {
      const pack = r.packQty ? ` | pack ${r.packQty}${r.packUnit}` : '';
      console.log(`  - ${r.title} | ${r.price ?? '?'} ${r.currency ?? ''}${pack} | ${r.url}`);
    }

    let link = KNOWN_LINKS[provider.id];
    if (!link.externalId && !link.url) {
      const first = results.find((r) => r.url);
      if (!first) throw new Error('no search result to fetch');
      link = {
        ...link,
        externalId: first.externalId,
        variantId: first.variantId ?? null,
        query: first.query ?? null,
        url: first.url,
      };
    }
    const price = await provider.fetchPrice(link, ctx);
    const pack = price.packSize ? ` pack=${price.packSize.qty}${price.packSize.unit} (${price.packSource})` : '';
    console.log(`fetchPrice: ${price.price} ${price.currency} inStock=${price.inStock}${pack} (${price.title ?? 'no title'})`);
  } catch (err) {
    console.error(`FAILED: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

await runCleanup(ctx);
