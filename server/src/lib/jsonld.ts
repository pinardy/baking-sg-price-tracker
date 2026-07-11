// Shared schema.org JSON-LD helpers, used by the WooCommerce fallback path
// and the Bake With Yen provider.

export function tryParseJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * JSON-LD can be a node, an array, or an @graph. Returns a Product node;
 * for ProductGroup (WooCommerce variable products), picks the best variant:
 * in-stock first, then lowest price.
 */
export function findProductNode(node: any): any | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return null;
  }
  const type = node['@type'];
  const hasType = (t: string) => type === t || (Array.isArray(type) && type.includes(t));
  if (hasType('ProductGroup') && Array.isArray(node.hasVariant)) {
    return pickBestVariant(node.hasVariant);
  }
  if (hasType('Product')) return node;
  if (node['@graph']) return findProductNode(node['@graph']);
  return null;
}

export function pickBestVariant(variants: any[]): any | null {
  const scored = variants
    .map((variant) => ({ variant, offer: extractOffer(variant) }))
    .filter((entry) => entry.offer !== null);
  if (!scored.length) return null;
  scored.sort((a, b) => {
    const aStock = a.offer!.availability && /InStock/i.test(a.offer!.availability) ? 0 : 1;
    const bStock = b.offer!.availability && /InStock/i.test(b.offer!.availability) ? 0 : 1;
    return aStock - bStock || a.offer!.price - b.offer!.price;
  });
  return scored[0].variant;
}

/**
 * Extracts price/currency/availability from a JSON-LD Product node.
 * Handles offers as object or array, and prices nested under
 * priceSpecification (itself object or array) as some SEO plugins emit.
 */
export function extractOffer(
  product: any,
): { price: number; currency: string | null; availability: string | null } | null {
  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  if (!offer) return null;
  const spec = Array.isArray(offer.priceSpecification) ? offer.priceSpecification[0] : offer.priceSpecification;
  const raw = offer.price ?? offer.lowPrice ?? spec?.price;
  const price = parseFloat(String(raw ?? ''));
  if (!Number.isFinite(price)) return null;
  const currency = offer.priceCurrency ?? spec?.priceCurrency ?? null;
  return {
    price,
    currency: currency ? String(currency) : null,
    availability: offer.availability ? String(offer.availability) : null,
  };
}
