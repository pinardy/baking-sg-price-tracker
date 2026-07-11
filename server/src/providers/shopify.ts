import { ProviderError } from '../lib/errors.js';
import type { FetchContext, LinkRef, PriceProvider, PriceResult, SearchResult } from './types.js';

interface ShopifyVariant {
  id: number;
  title: string;
  /** Cents in the /products/<handle>.js payload. */
  price: number;
  available: boolean;
}

interface ShopifyProduct {
  handle: string;
  title: string;
  variants: ShopifyVariant[];
  images?: string[];
  featured_image?: string;
}

interface SuggestProduct {
  handle: string;
  title: string;
  price?: string;
  image?: string;
  available?: boolean;
}

/** Suggest results to expand into per-variant rows (each costs one request). */
const EXPAND_LIMIT = 6;

/**
 * Generic provider for Shopify storefronts, which expose products as JSON at
 * /search/suggest.json and /products/<handle>.json without auth.
 */
export class ShopifyProvider implements PriceProvider {
  readonly kind = 'retailer' as const;

  constructor(
    readonly id: string,
    readonly label: string,
    private baseUrl: string,
    private currency: string,
  ) {}

  enabled(): boolean {
    return true;
  }

  async search(query: string, ctx: FetchContext): Promise<SearchResult[]> {
    const url = `${this.baseUrl}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`;
    const response = await ctx.fetch(url);
    if (!response.ok) throw new ProviderError(this.id, `suggest HTTP ${response.status}`);
    const body = (await response.json()) as {
      resources?: { results?: { products?: SuggestProduct[] } };
    };
    const suggestions = body.resources?.results?.products ?? [];

    const results: SearchResult[] = [];
    for (const [index, suggestion] of suggestions.entries()) {
      if (index < EXPAND_LIMIT) {
        // Expand into concrete variants so the user can pick gauge/size.
        try {
          const product = await this.getProduct(suggestion.handle, ctx);
          for (const variant of product.variants) {
            results.push({
              providerId: this.id,
              externalId: product.handle,
              variantId: String(variant.id),
              title:
                variant.title === 'Default Title'
                  ? product.title
                  : `${product.title} — ${variant.title}`,
              url: `${this.baseUrl}/products/${product.handle}`,
              price: variant.price / 100,
              currency: this.currency,
              imageUrl: product.featured_image ?? product.images?.[0],
            });
          }
          continue;
        } catch {
          // fall through to the un-expanded suggestion row
        }
      }
      results.push({
        providerId: this.id,
        externalId: suggestion.handle,
        variantId: null,
        title: suggestion.title,
        url: `${this.baseUrl}/products/${suggestion.handle}`,
        price: suggestion.price ? parseFloat(suggestion.price) : undefined,
        currency: this.currency,
        imageUrl: suggestion.image,
      });
    }
    return results;
  }

  async fetchPrice(link: LinkRef, ctx: FetchContext): Promise<PriceResult> {
    if (!link.externalId) throw new ProviderError(this.id, 'link has no product handle');
    const product = await this.getProduct(link.externalId, ctx);

    const variant = link.variantId
      ? product.variants.find((v) => String(v.id) === link.variantId)
      : (product.variants.find((v) => v.available) ?? product.variants[0]);
    if (!variant) {
      throw new ProviderError(this.id, `variant ${link.variantId} gone from ${link.externalId}`);
    }

    const price = variant.price / 100;
    if (!Number.isFinite(price)) {
      throw new ProviderError(this.id, `unparseable price "${variant.price}" for ${link.externalId}`);
    }
    return {
      price,
      currency: this.currency,
      inStock: variant.available,
      title: product.title,
      imageUrl: absoluteUrl(product.featured_image ?? product.images?.[0]),
    };
  }

  private async getProduct(handle: string, ctx: FetchContext): Promise<ShopifyProduct> {
    const cacheKey = `shopify-product:${this.baseUrl}:${handle}`;
    const cached = ctx.cache.get(cacheKey);
    if (cached) return cached as ShopifyProduct;

    // The .js endpoint (unlike .json) includes per-variant availability.
    const response = await ctx.fetch(`${this.baseUrl}/products/${handle}.js`);
    if (!response.ok) throw new ProviderError(this.id, `HTTP ${response.status} for ${handle}`);
    const product = (await response.json()) as ShopifyProduct;
    if (!product?.variants?.length) {
      throw new ProviderError(this.id, `no variants in response for ${handle}`);
    }
    ctx.cache.set(cacheKey, product);
    return product;
  }
}

/** Shopify returns protocol-relative image URLs ("//cdn.shopify.com/…"). */
function absoluteUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith('//') ? `https:${url}` : url;
}
