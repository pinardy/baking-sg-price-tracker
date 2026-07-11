import { ProviderError } from '../lib/errors.js';
import { isPlaywrightAvailable, withPage } from '../lib/browser.js';
import { parsePackSize } from '../lib/packSize.js';
import { normalizeKey, parsePrice } from '../lib/scrape.js';
import type { FetchContext, LinkRef, PriceProvider, PriceResult, SearchResult } from './types.js';

const BASE = 'https://shengsiong.com.sg';
const CARD = '.product-preview';

interface ScrapedCard {
  name: string | null;
  size: string | null;
  promo: string | null;
  price: string | null;
  img: string | null;
}

/**
 * Sheng Siong runs a Meteor SPA (no server-rendered HTML, no public product
 * API), scraped from the rendered DOM with a headless browser. Its listings
 * have no stable per-product URLs, so links store the search query plus a
 * normalized name key and fetchPrice re-searches and re-matches — the same
 * shape as a marketplace provider. residentialOnly: needs a browser and a
 * non-datacenter IP.
 */
export class ShengSiongProvider implements PriceProvider {
  readonly id = 'shengsiong';
  readonly label = 'Sheng Siong';
  readonly kind = 'retailer' as const;
  readonly residentialOnly = true;

  enabled(): boolean {
    return isPlaywrightAvailable();
  }

  async search(query: string, ctx: FetchContext): Promise<SearchResult[]> {
    const cards = await this.scrape(query, ctx);
    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const card of cards) {
      if (!card.name) continue;
      const key = normalizeKey(card.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const title = card.size ? `${card.name} ${card.size}` : card.name;
      const pack = parsePackSize(card.size ?? '') ?? parsePackSize(title);
      results.push({
        providerId: this.id,
        externalId: key,
        variantId: null,
        // No product page exists; store the query so fetchPrice can re-find it.
        query,
        title,
        url: `${BASE}/search/${encodeURIComponent(query)}`,
        price: parsePrice(card.promo) ?? parsePrice(card.price) ?? undefined,
        currency: 'SGD',
        imageUrl: card.img ?? undefined,
        ...(pack ? { packQty: pack.qty, packUnit: pack.unit } : {}),
      });
    }
    return results.slice(0, 15);
  }

  async fetchPrice(link: LinkRef, ctx: FetchContext): Promise<PriceResult> {
    const query = link.query;
    if (!query) throw new ProviderError(this.id, 'link has no stored search query');
    const cards = await this.scrape(query, ctx);
    const match = cards.find((c) => c.name && normalizeKey(c.name) === link.externalId);
    if (!match) {
      throw new ProviderError(this.id, `"${link.externalId}" no longer in results for "${query}"`);
    }
    const price = parsePrice(match.promo) ?? parsePrice(match.price);
    if (price == null) throw new ProviderError(this.id, `unparseable price for "${link.externalId}"`);
    const title = match.size ? `${match.name} ${match.size}` : match.name!;
    const pack = parsePackSize(match.size ?? '') ?? parsePackSize(title);
    return {
      price,
      currency: 'SGD',
      inStock: true, // listed results are purchasable; SS hides out-of-stock items
      title,
      ...(match.img ? { imageUrl: match.img } : {}),
      ...(pack ? { packSize: pack, packSource: 'parsed' as const } : {}),
    };
  }

  private async scrape(query: string, ctx: FetchContext): Promise<ScrapedCard[]> {
    return withPage(ctx, async (page) => {
      await page.goto(`${BASE}/search/${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
      const appeared = await page.waitForSelector(CARD, { timeout: 20_000 }).catch(() => null);
      if (!appeared) return [];
      return (await page.$$eval(CARD, (cards: any[]) =>
        cards.map((card) => ({
          name: card.querySelector('.product-name')?.textContent?.trim() ?? null,
          size: card.querySelector('.product-packSize')?.textContent?.trim() ?? null,
          promo: card.querySelector('.promo-price')?.textContent?.trim() ?? null,
          price:
            card.querySelector('.product-price')?.textContent?.trim() ??
            card.querySelector('.current-price')?.textContent?.trim() ??
            null,
          img: (() => {
            const img = card.querySelector('img.product-img, img');
            return img ? img.getAttribute('src') || img.getAttribute('data-src') : null;
          })(),
        })),
      )) as ScrapedCard[];
    });
  }
}
