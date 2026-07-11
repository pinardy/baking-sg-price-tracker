import { ProviderError } from '../lib/errors.js';
import { isPlaywrightAvailable, withPage } from '../lib/browser.js';
import { parsePackSize } from '../lib/packSize.js';
import { decodeNextImage, parsePrice } from '../lib/scrape.js';
import type { FetchContext, LinkRef, PriceProvider, PriceResult, SearchResult } from './types.js';

const BASE = 'https://coldstorage.com.sg';
const CARD = '[class*="product-item_product-item"]';
const NAME = '[class*="product-item_product-item__name"]';
// Search-card price vs. the main price on a product detail page (the detail
// page also renders a related-products carousel using the card price class).
const CARD_PRICE = '[class*="product-price_product-price__price"]';
const DETAIL_PRICE = '[class*="product-info_product-info__price"]';

/**
 * Cold Storage (DFI Retail) runs a client-rendered Next.js storefront with no
 * public product API, so prices are scraped from the rendered DOM with a
 * headless browser. Product pages have stable /product/<slug> URLs.
 * residentialOnly: needs a browser and a non-datacenter IP.
 */
export class ColdStorageProvider implements PriceProvider {
  readonly id = 'coldstorage';
  readonly label = 'Cold Storage';
  readonly kind = 'retailer' as const;
  readonly residentialOnly = true;

  enabled(): boolean {
    return isPlaywrightAvailable();
  }

  async search(query: string, ctx: FetchContext): Promise<SearchResult[]> {
    return withPage(ctx, async (page) => {
      await page.goto(`${BASE}/search?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(CARD, { timeout: 20_000 }).catch(() => {});
      const rows = (await page.$$eval(
        CARD,
        (cards: any[], sel: { name: string; price: string }) =>
          cards.map((card) => {
            const a = card.querySelector('a[href*="/product/"]');
            const img = card.querySelector('img');
            return {
              href: a ? a.getAttribute('href') : null,
              name: card.querySelector(sel.name)?.textContent?.trim() ?? null,
              price: card.querySelector(sel.price)?.textContent?.trim() ?? null,
              img: img ? img.getAttribute('src') : null,
            };
          }),
        { name: NAME, price: CARD_PRICE },
      )) as { href: string | null; name: string | null; price: string | null; img: string | null }[];

      const seen = new Set<string>();
      const results: SearchResult[] = [];
      for (const row of rows) {
        const slug = slugFromHref(row.href);
        if (!slug || !row.name || seen.has(slug)) continue;
        seen.add(slug);
        const pack = parsePackSize(row.name);
        results.push({
          providerId: this.id,
          externalId: slug,
          variantId: null,
          title: row.name,
          url: `${BASE}/product/${slug}`,
          price: parsePrice(row.price) ?? undefined,
          currency: 'SGD',
          imageUrl: decodeNextImage(row.img, BASE),
          ...(pack ? { packQty: pack.qty, packUnit: pack.unit } : {}),
        });
      }
      return results.slice(0, 20);
    });
  }

  async fetchPrice(link: LinkRef, ctx: FetchContext): Promise<PriceResult> {
    const url = link.url || (link.externalId ? `${BASE}/product/${link.externalId}` : null);
    if (!url) throw new ProviderError(this.id, 'link has no URL or slug');

    return withPage(ctx, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const priceEl = await page.waitForSelector(DETAIL_PRICE, { timeout: 20_000 }).catch(() => null);
      if (!priceEl) throw new ProviderError(this.id, `no price rendered on ${url}`);
      const data = (await page.evaluate(
        (sel: string) => {
          const d: any = (globalThis as any).document;
          return {
            price: d.querySelector(sel)?.textContent ?? null,
            title: d.querySelector('h1')?.textContent?.trim() ?? null,
            image: d.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null,
            outOfStock: /out of stock|sold out|unavailable/i.test(d.body.innerText || ''),
          };
        },
        DETAIL_PRICE,
      )) as { price: string | null; title: string | null; image: string | null; outOfStock: boolean };

      const price = parsePrice(data.price);
      if (price == null) throw new ProviderError(this.id, `unparseable price on ${url}`);
      const pack = data.title ? parsePackSize(data.title) : null;
      return {
        price,
        currency: 'SGD',
        inStock: !data.outOfStock,
        title: data.title ?? undefined,
        ...(data.image ? { imageUrl: data.image } : {}),
        ...(pack ? { packSize: pack, packSource: 'parsed' as const } : {}),
      };
    });
  }
}

function slugFromHref(href: string | null): string | null {
  if (!href) return null;
  const match = href.match(/\/product\/([^/?#]+)/);
  return match ? match[1] : null;
}
