export interface ProviderInfo {
  id: string;
  label: string;
  kind: 'retailer' | 'marketplace';
  /** Scraped only from local (residential-IP) refreshes, so data ages between them. */
  residentialOnly?: boolean;
}

export const CATEGORIES = [
  'flour',
  'sugar',
  'dairy',
  'eggs',
  'leavening',
  'chocolate-cocoa',
  'nuts-seeds',
  'flavoring',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  flour: 'Flour',
  sugar: 'Sugar',
  dairy: 'Dairy',
  eggs: 'Eggs',
  leavening: 'Leavening',
  'chocolate-cocoa': 'Chocolate & cocoa',
  'nuts-seeds': 'Nuts & seeds',
  flavoring: 'Flavoring',
  other: 'Other',
};

export type PackUnit = 'g' | 'kg' | 'ml' | 'l' | 'pcs';

export interface ProductLink {
  id: number;
  product_id: number;
  provider_id: string;
  external_id: string | null;
  variant_id: string | null;
  query: string | null;
  url: string;
  title: string | null;
  pack_qty: number | null;
  pack_unit: PackUnit | null;
  pack_source: 'none' | 'parsed' | 'provider' | 'manual';
  image_url: string | null;
  brand: string | null;
  is_active: number;
  latest_price: number | null;
  latest_currency: string | null;
  latest_price_sgd: number | null;
  latest_in_stock: number | null;
  latest_scraped_at: string | null;
  /** Derived server-side: latest SGD price divided by the pack's base quantity. */
  unit_price_sgd: number | null;
  unit_base: 'kg' | 'l' | 'pcs' | null;
}

export interface Product {
  id: number;
  name: string;
  category: Category;
  brand: string | null;
  variant_desc: string | null;
  target_price: number | null;
  target_currency: string;
  is_active: number;
  created_at: string;
  image_url: string | null;
  links: ProductLink[];
  lowest: {
    price: number;
    currency: string;
    price_sgd: number | null;
    provider_id: string;
    url: string;
  } | null;
  cheapest_per_unit: {
    unit_price_sgd: number;
    unit_base: 'kg' | 'l' | 'pcs';
    provider_id: string;
    url: string;
  } | null;
}

export interface SearchResult {
  providerId: string;
  externalId: string | null;
  variantId?: string | null;
  query?: string | null;
  title: string;
  url: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  packQty?: number;
  packUnit?: PackUnit;
}

export interface ProviderSearchOutcome {
  providerId: string;
  label: string;
  kind: 'retailer' | 'marketplace';
  results?: SearchResult[];
  error?: string;
}

export interface FetchStatus {
  running: boolean;
  lastRun: {
    id: number;
    trigger: string;
    started_at: string;
    finished_at: string | null;
    ok_count: number;
    error_count: number;
    error_log: string | null;
  } | null;
}

export interface Alert {
  id: number;
  product_id: number;
  product_name: string;
  provider_id: string | null;
  link_url: string | null;
  price: number;
  currency: string;
  target_price: number;
  acknowledged: number;
  created_at: string;
}

export interface HistoryPoint {
  link_id: number;
  provider_id: string;
  price: number;
  currency: string;
  price_sgd: number | null;
  scraped_at: string;
  pack_qty: number | null;
  pack_unit: PackUnit | null;
}

/** True in the read-only static build (GitHub Pages) — data comes from exported JSON. */
export const IS_STATIC = import.meta.env.VITE_STATIC === '1';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${response.status}: ${body || response.statusText}`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

/** Reads a JSON file exported by `npm run export:static` (static build only). */
function staticData<T>(path: string): Promise<T> {
  return request<T>(`${import.meta.env.BASE_URL}data/${path}`);
}

function readOnly(): never {
  throw new Error('read-only static build');
}

export const api = {
  providers: () =>
    IS_STATIC ? staticData<ProviderInfo[]>('providers.json') : request<ProviderInfo[]>('/api/providers'),
  products: () =>
    IS_STATIC ? staticData<Product[]>('products.json') : request<Product[]>('/api/products'),
  product: (id: number | string) =>
    IS_STATIC
      ? staticData<Omit<Product, 'lowest' | 'cheapest_per_unit'>>(`products/${id}.json`)
      : request<Omit<Product, 'lowest' | 'cheapest_per_unit'>>(`/api/products/${id}`),
  createProduct: (body: unknown) =>
    IS_STATIC
      ? readOnly()
      : request<{ id: number }>('/api/products', { method: 'POST', body: JSON.stringify(body) }),
  patchProduct: (id: number, body: unknown) =>
    IS_STATIC
      ? readOnly()
      : request<Product>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProduct: (id: number) =>
    IS_STATIC ? readOnly() : request<void>(`/api/products/${id}`, { method: 'DELETE' }),
  history: async (id: number | string, days: number) => {
    if (!IS_STATIC) return request<HistoryPoint[]>(`/api/products/${id}/history?days=${days}`);
    // One 365-day export per product; narrower ranges filter locally.
    const rows = await staticData<HistoryPoint[]>(`history/${id}.json`);
    const cutoff = Date.now() - days * 86_400_000;
    return rows.filter((r) => new Date(r.scraped_at + 'Z').getTime() >= cutoff);
  },
  addLink: (productId: number | string, link: SearchResult) =>
    IS_STATIC
      ? readOnly()
      : request<{ id: number }>(`/api/products/${productId}/links`, {
          method: 'POST',
          body: JSON.stringify(link),
        }),
  removeLink: (linkId: number) =>
    IS_STATIC ? readOnly() : request<void>(`/api/links/${linkId}`, { method: 'DELETE' }),
  patchLink: (linkId: number, body: { pack_qty: number | null; pack_unit: PackUnit | null }) =>
    IS_STATIC
      ? readOnly()
      : request<ProductLink>(`/api/links/${linkId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  search: (q: string) =>
    IS_STATIC
      ? readOnly()
      : request<ProviderSearchOutcome[]>(`/api/search?q=${encodeURIComponent(q)}`),
  startFetch: () =>
    IS_STATIC ? readOnly() : request<{ status: string }>('/api/fetch', { method: 'POST' }),
  fetchStatus: () =>
    IS_STATIC ? staticData<FetchStatus>('status.json') : request<FetchStatus>('/api/fetch/status'),
  alerts: async (onlyOpen: boolean) => {
    if (!IS_STATIC) return request<Alert[]>(`/api/alerts${onlyOpen ? '?unacknowledged=1' : ''}`);
    const rows = await staticData<Alert[]>('alerts.json');
    return onlyOpen ? rows.filter((a) => !a.acknowledged) : rows;
  },
  ackAlert: (id: number) =>
    IS_STATIC ? readOnly() : request<void>(`/api/alerts/${id}/ack`, { method: 'POST' }),
  ackAllAlerts: () =>
    IS_STATIC ? readOnly() : request<void>('/api/alerts/ack-all', { method: 'POST' }),
};

export const PROVIDER_COLORS: Record<string, string> = {
  redman: '#dc2626',
  bakeking: '#d97706',
  fairprice: '#2563eb',
  bakewithyen: '#7c3aed',
};

export function formatPrice(price: number, currency: string): string {
  try {
    // en-SG renders SGD as "S$" and USD as "US$" — unambiguous side by side.
    return new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(price);
  } catch {
    return `${price.toFixed(2)} ${currency}`;
  }
}

/** SGD-first display: "S$108.98 · US$84.25" for overseas shops, plain "S$85.00" for SGD. */
export function formatDualPrice(priceSgd: number | null, price: number, currency: string): string {
  if (currency === 'SGD' || priceSgd == null) return formatPrice(price, currency);
  return `${formatPrice(priceSgd, 'SGD')} · ${formatPrice(price, currency)}`;
}

const BASE_UNIT_LABELS: Record<string, string> = { kg: 'kg', l: 'L', pcs: 'pc' };

/** "$5.60/kg", "$0.42/pc" — comparable across pack sizes. */
export function formatUnitPrice(unitPriceSgd: number | null, base: string | null): string | null {
  if (unitPriceSgd == null || !base) return null;
  return `${formatPrice(unitPriceSgd, 'SGD')}/${BASE_UNIT_LABELS[base] ?? base}`;
}

/** "1kg", "500g", "10 pcs" for display next to a listing. */
export function formatPackSize(qty: number | null, unit: string | null): string | null {
  if (qty == null || !unit) return null;
  return unit === 'pcs' ? `${qty} pcs` : `${qty}${unit === 'l' ? 'L' : unit}`;
}
