import type { PriceProvider } from './types.js';
import { ShopifyProvider } from './shopify.js';
import { WooCommerceProvider } from './woocommerce.js';
import { FairPriceProvider } from './fairprice.js';
import { BakeWithYenProvider } from './bakewithyen.js';

// Future work: a Sheng Siong provider needs a headless browser (Meteor SPA
// behind Imperva) — it would implement PriceProvider with Playwright inside
// and set residentialOnly, slotting in as one more entry here.
const allProviders: PriceProvider[] = [
  new ShopifyProvider('redman', 'RedMan (Phoon Huat)', 'https://shop.redmanshop.com', 'SGD'),
  new WooCommerceProvider('bakeking', 'Bake King', 'https://bakeking.com.sg', 'SGD'),
  new FairPriceProvider(),
  new BakeWithYenProvider(),
];

/**
 * FETCH_PROVIDERS (allowlist) beats SKIP_PROVIDERS (denylist); with neither
 * set, residential-only providers drop out automatically in CI (GitHub
 * Actions sets CI=true) since Cloudflare blocks datacenter IPs — the last
 * committed snapshot stands until the next local refresh.
 */
function providerActive(provider: PriceProvider): boolean {
  if (!provider.enabled()) return false;
  const only = csv(process.env.FETCH_PROVIDERS);
  if (only) return only.includes(provider.id);
  if (csv(process.env.SKIP_PROVIDERS)?.includes(provider.id)) return false;
  if (provider.residentialOnly && process.env.CI === 'true') return false;
  return true;
}

function csv(value: string | undefined): string[] | null {
  const items = value
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items?.length ? items : null;
}

export function getProviders(): PriceProvider[] {
  return allProviders.filter(providerActive);
}

export function getProvider(id: string): PriceProvider | undefined {
  return allProviders.find((p) => p.id === id && providerActive(p));
}

/** True when the id exists at all — filtered providers skip silently, unknown ids error. */
export function isKnownProvider(id: string): boolean {
  return allProviders.some((p) => p.id === id);
}
