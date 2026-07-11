import { ProviderError } from '../lib/errors.js';
import { parsePackSize } from '../lib/packSize.js';
import type { FetchContext, LinkRef, PriceProvider, PriceResult, SearchResult } from './types.js';

const BASE = 'https://www.fairprice.com.sg';

const HTML_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

/**
 * NTUC FairPrice runs a custom Next.js storefront. Search and product pages
 * are server-rendered with the full product objects embedded in the
 * __NEXT_DATA__ script, so plain fetch + JSON.parse is enough — no API key,
 * no headless browser. Pages are large (~4MB per search), hence the string
 * slicing instead of a DOM parse.
 */
export class FairPriceProvider implements PriceProvider {
  readonly id = 'fairprice';
  readonly label = 'NTUC FairPrice';
  readonly kind = 'retailer' as const;

  enabled(): boolean {
    return true;
  }

  async search(query: string, ctx: FetchContext): Promise<SearchResult[]> {
    const url = `${BASE}/search?query=${encodeURIComponent(query)}`;
    const response = await ctx.fetch(url, { headers: HTML_HEADERS });
    if (!response.ok) throw new ProviderError(this.id, `search HTTP ${response.status}`);
    const data = extractNextData(await response.text(), this.id);
    return findProducts(data)
      .slice(0, 20)
      .map((product) => this.toSearchResult(product));
  }

  async fetchPrice(link: LinkRef, ctx: FetchContext): Promise<PriceResult> {
    if (!link.externalId) throw new ProviderError(this.id, 'link has no product slug');

    const cacheKey = `fairprice-product:${link.externalId}`;
    let data = ctx.cache.get(cacheKey);
    if (!data) {
      const response = await ctx.fetch(`${BASE}/product/${link.externalId}`, { headers: HTML_HEADERS });
      if (!response.ok) {
        throw new ProviderError(this.id, `HTTP ${response.status} for ${link.externalId}`);
      }
      data = extractNextData(await response.text(), this.id);
      ctx.cache.set(cacheKey, data);
    }

    const products = findProducts(data);
    const product =
      products.find((p) => p.slug === link.externalId) ?? (products.length === 1 ? products[0] : null);
    if (!product) {
      throw new ProviderError(this.id, `product ${link.externalId} not found in page data`);
    }

    const price = productPrice(product);
    if (price == null) {
      throw new ProviderError(this.id, `no price on ${link.externalId}`);
    }
    const packText = unitOfWeight(product);
    const pack = packText ? parsePackSize(packText) : null;
    return {
      price,
      currency: 'SGD',
      inStock: productInStock(product),
      title: product.name,
      imageUrl: firstImage(product),
      ...(pack ? { packSize: pack, packSource: 'provider' as const } : {}),
    };
  }

  private toSearchResult(product: any): SearchResult {
    const packText = unitOfWeight(product);
    const pack = (packText && parsePackSize(packText)) || parsePackSize(String(product.name ?? ''));
    return {
      providerId: this.id,
      externalId: String(product.slug),
      variantId: null,
      title: String(product.name),
      url: `${BASE}/product/${product.slug}`,
      price: productPrice(product) ?? undefined,
      currency: 'SGD',
      imageUrl: firstImage(product),
      ...(pack ? { packQty: pack.qty, packUnit: pack.unit } : {}),
    };
  }
}

/** Pulls the JSON out of <script id="__NEXT_DATA__" ...>...</script>. */
export function extractNextData(html: string, providerId: string): unknown {
  const marker = html.indexOf('id="__NEXT_DATA__"');
  if (marker === -1) throw new ProviderError(providerId, 'no __NEXT_DATA__ script in page');
  const start = html.indexOf('>', marker) + 1;
  const end = html.indexOf('</script>', start);
  if (start === 0 || end === -1) throw new ProviderError(providerId, 'malformed __NEXT_DATA__ script');
  try {
    return JSON.parse(html.slice(start, end));
  } catch {
    throw new ProviderError(providerId, 'unparseable __NEXT_DATA__ JSON');
  }
}

/**
 * The exact props path to the product list is brittle across Next.js
 * deploys, so scan the whole blob for objects that look like products
 * (name + slug + a price), deduped by slug.
 */
export function findProducts(node: unknown): any[] {
  const found = new Map<string, any>();
  walk(node, (obj) => {
    if (
      typeof obj.name === 'string' &&
      typeof obj.slug === 'string' &&
      productPrice(obj) != null &&
      !found.has(obj.slug)
    ) {
      found.set(obj.slug, obj);
    }
  });
  return [...found.values()];
}

function walk(node: unknown, visit: (obj: Record<string, any>) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  visit(node as Record<string, any>);
  for (const value of Object.values(node)) walk(value, visit);
}

/**
 * Effective price: a single-unit promo offer beats the regular price
 * (search pages carry `final_price`; product pages only have
 * `storeSpecificData[0].mrp` when there is no offer).
 */
function productPrice(product: any): number | null {
  const offer = Array.isArray(product.offers) ? product.offers[0] : undefined;
  if (offer && offerIsSingleUnit(offer)) {
    const value = asPrice(offer.price);
    if (value != null) return value;
  }
  const ssd = Array.isArray(product.storeSpecificData) ? product.storeSpecificData[0] : undefined;
  for (const candidate of [product.final_price, product.price, ssd?.mrp]) {
    const value = asPrice(candidate);
    if (value != null) return value;
  }
  return null;
}

/** Multi-buy promos ("2 for $5") price several units — not a unit price. */
function offerIsSingleUnit(offer: any): boolean {
  const buy = offer?.rule?.buy;
  if (!buy || typeof buy !== 'object') return true;
  const qty = Object.values(buy).reduce(
    (sum: number, entry: any) => sum + (typeof entry?.q === 'number' ? entry.q : 0),
    0,
  );
  return qty <= 1;
}

function asPrice(candidate: unknown): number | null {
  const value = typeof candidate === 'string' ? parseFloat(candidate) : candidate;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** FairPrice exposes pack size structurally as metadata "Unit Of Weight" (e.g. "1KG"). */
function unitOfWeight(product: any): string | null {
  for (const meta of [product.metaData, product.meta_data, product.metadata]) {
    const value = meta?.['Unit Of Weight'] ?? meta?.['DisplayUnit'];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function productInStock(product: any): boolean | null {
  const ssd = Array.isArray(product.storeSpecificData) ? product.storeSpecificData[0] : undefined;
  for (const level of [ssd?.stock, ssd?.onlineStock, ssd?.inStoreStock]) {
    if (typeof level === 'number') return level > 0;
  }
  if (typeof product.available === 'boolean') return product.available;
  if (typeof product.outOfStock === 'boolean') return !product.outOfStock;
  return null;
}

function firstImage(product: any): string | undefined {
  const image = Array.isArray(product.images) ? product.images[0] : product.images;
  return typeof image === 'string' ? image : undefined;
}
