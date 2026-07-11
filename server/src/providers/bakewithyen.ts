import * as cheerio from 'cheerio';
import { ProviderError } from '../lib/errors.js';
import { extractOffer, findProductNode, tryParseJson } from '../lib/jsonld.js';
import { parsePackSize } from '../lib/packSize.js';
import type { FetchContext, LinkRef, PriceProvider, PriceResult, SearchResult } from './types.js';

const BASE = 'https://www.bakewithyen.sg';

// Cloudflare in front of the SiteGiant storefront rejects non-browser UAs
// (and all datacenter IPs, hence residentialOnly).
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-SG,en;q=0.9',
};

/**
 * Bake With Yen (SiteGiant/Next.js storefront). Product pages embed
 * schema.org JSON-LD with name/price/availability. Category grids are
 * client-rendered and search discovery is unreliable, so the primary way to
 * attach a listing is pasting its product URL into the source search box;
 * a best-effort anchor harvest backs it up.
 */
export class BakeWithYenProvider implements PriceProvider {
  readonly id = 'bakewithyen';
  readonly label = 'Bake With Yen';
  readonly kind = 'retailer' as const;
  readonly residentialOnly = true;

  enabled(): boolean {
    return true;
  }

  async search(query: string, ctx: FetchContext): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (isProductUrl(trimmed)) {
      const result = await this.resultFromProductPage(trimmed, ctx);
      return result ? [result] : [];
    }

    // The SSR search page at /product/search renders each result as a group
    // of anchors on the same slug (discount badge, title, price strip) —
    // harvest and merge them. Failures degrade to "no matches" rather than
    // breaking multi-source search.
    try {
      const response = await ctx.fetch(
        `${BASE}/product/search?search=${encodeURIComponent(trimmed)}&page=1`,
        { headers: BROWSER_HEADERS },
      );
      if (!response.ok) return [];
      const $ = cheerio.load(await response.text());

      const bySlug = new Map<string, { url: string; texts: string[] }>();
      $('a[href*="/product/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const url = href.startsWith('http') ? href : `${BASE}${href}`;
        const slug = slugFromUrl(url);
        if (!slug || slug === 'search') return;
        const entry = bySlug.get(slug) ?? bySlug.set(slug, { url, texts: [] }).get(slug)!;
        const text = $(el).text().trim();
        if (text) entry.texts.push(text);
      });

      const results: SearchResult[] = [];
      for (const [slug, { url, texts }] of bySlug) {
        const title = pickTitle(texts) ?? slug.replace(/-/g, ' ');
        const price = pickPrice(texts);
        const pack = parsePackSize(title);
        results.push({
          providerId: this.id,
          externalId: slug,
          variantId: null,
          title,
          url,
          ...(price != null ? { price, currency: 'SGD' } : {}),
          ...(pack ? { packQty: pack.qty, packUnit: pack.unit } : {}),
        });
      }

      // The page also renders unrelated carousels; prefer results that
      // actually mention a query token, falling back to everything.
      const tokens = trimmed.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      const relevant = tokens.length
        ? results.filter((r) => tokens.some((t) => r.title.toLowerCase().includes(t)))
        : results;
      return (relevant.length ? relevant : results).slice(0, 10);
    } catch {
      return [];
    }
  }

  async fetchPrice(link: LinkRef, ctx: FetchContext): Promise<PriceResult> {
    const url = link.url || (link.externalId ? `${BASE}/product/${link.externalId}` : null);
    if (!url) throw new ProviderError(this.id, 'link has no URL or slug');

    const response = await ctx.fetch(url, { headers: BROWSER_HEADERS });
    if (response.status === 403) {
      throw new ProviderError(
        this.id,
        'blocked (403) — Cloudflare rejects datacenter IPs; run from a residential connection',
      );
    }
    if (!response.ok) throw new ProviderError(this.id, `HTTP ${response.status} for ${url}`);

    const product = firstJsonLdProduct(await response.text());
    const offer = product ? extractOffer(product) : null;
    if (!product || !offer) {
      throw new ProviderError(this.id, `no JSON-LD product price on ${url}`);
    }

    const title = product.name ? String(product.name) : undefined;
    const pack = title ? parsePackSize(title) : null;
    return {
      price: offer.price,
      currency: offer.currency ?? 'SGD',
      inStock: offer.availability ? /InStock/i.test(offer.availability) : null,
      title,
      ...(pack ? { packSize: pack, packSource: 'parsed' as const } : {}),
    };
  }

  private async resultFromProductPage(url: string, ctx: FetchContext): Promise<SearchResult | null> {
    const slug = slugFromUrl(url);
    if (!slug) return null;
    const link: LinkRef = { providerId: this.id, externalId: slug, variantId: null, query: null, url };
    const price = await this.fetchPrice(link, ctx);
    return {
      providerId: this.id,
      externalId: slug,
      variantId: null,
      title: price.title ?? slug.replace(/-/g, ' '),
      url,
      price: price.price,
      currency: price.currency,
      ...(price.packSize ? { packQty: price.packSize.qty, packUnit: price.packSize.unit } : {}),
    };
  }
}

/** The product-name anchor: longest text that isn't a price strip or "N% off" badge. */
function pickTitle(texts: string[]): string | null {
  const candidates = texts.filter((t) => /[a-z]{3}/i.test(t) && !/^\d+%\s*off$/i.test(t) && !t.startsWith('$'));
  if (!candidates.length) return null;
  const longest = candidates.reduce((a, b) => (b.length > a.length ? b : a));
  // Promo badges render inside the title anchor and concatenate: "Free GiftBAKERS 365 …"
  return longest.replace(/^Free\s*Gift(?=[A-Z0-9])/i, '').trim();
}

/** Price strips look like "$4.00$3.15$3.15$4.00-21%"; the discounted price is the minimum. */
function pickPrice(texts: string[]): number | null {
  const values = texts
    .filter((t) => t.startsWith('$'))
    .flatMap((t) => [...t.matchAll(/\$(\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1])))
    .filter((v) => Number.isFinite(v) && v > 0);
  return values.length ? Math.min(...values) : null;
}

function isProductUrl(query: string): boolean {
  return /^https?:\/\/(www\.)?bakewithyen\.(sg|com\.sg|com)\//i.test(query);
}

function slugFromUrl(url: string): string | null {
  const match = url.match(/\/product\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * JSON-LD product from a page: real <script type="application/ld+json"> tags
 * first, then a balanced-brace scan for {"@context":...schema.org...} blobs
 * embedded in the Next.js RSC stream.
 */
export function firstJsonLdProduct(html: string): any | null {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const parsed = tryParseJson($(el).text());
    const product = parsed && findProductNode(parsed);
    if (product) return product;
  }

  let cursor = 0;
  while (true) {
    const start = html.indexOf('{"@context"', cursor);
    if (start === -1) return null;
    const candidate = extractBalancedJson(html, start);
    cursor = start + 1;
    if (!candidate) continue;
    const parsed = tryParseJson(candidate);
    const product = parsed && findProductNode(parsed);
    if (product) return product;
  }
}

/** Extracts one balanced {...} object starting at `start`, string-aware. */
function extractBalancedJson(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
