import type { PoliteFetch } from '../lib/politeFetch.js';
import type { PackSize } from '../lib/packSize.js';

export interface SearchResult {
  providerId: string;
  externalId: string | null;
  variantId?: string | null;
  /** Marketplace providers return the query to store instead of a fixed listing. */
  query?: string | null;
  title: string;
  url: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  /** Pack size when the provider exposes it structurally or it was parsed from the title. */
  packQty?: number;
  packUnit?: PackSize['unit'];
}

export interface PriceResult {
  price: number;
  currency: string;
  inStock: boolean | null;
  /** Current source title, used to warn when a link drifts to a different product. */
  title?: string;
  /** Pack size refresh; 'provider' beats 'parsed', neither overwrites a manual value. */
  packSize?: PackSize;
  packSource?: 'provider' | 'parsed';
  /** Product thumbnail, refreshed onto the link so the dashboard can show it. */
  imageUrl?: string;
}

export interface LinkRef {
  providerId: string;
  externalId: string | null;
  variantId: string | null;
  query: string | null;
  url: string;
}

export interface FetchContext {
  fetch: PoliteFetch;
  /** Per-run cache, e.g. full Shopify catalogs or a shared headless browser. */
  cache: Map<string, unknown>;
  /** Teardown callbacks (e.g. close the browser), run once the run/search ends. */
  cleanup?: Array<() => Promise<void>>;
}

export interface PriceProvider {
  id: string;
  label: string;
  kind: 'retailer' | 'marketplace';
  /**
   * Blocked from datacenter IPs (e.g. Cloudflare bot protection), so CI runs
   * skip this provider; a local `npm run refresh:push` covers it instead.
   */
  residentialOnly?: boolean;
  enabled(): boolean;
  search(query: string, ctx: FetchContext): Promise<SearchResult[]>;
  fetchPrice(link: LinkRef, ctx: FetchContext): Promise<PriceResult>;
}
