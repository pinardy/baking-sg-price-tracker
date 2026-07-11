import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  CATEGORIES,
  CATEGORY_LABELS,
  Category,
  formatDualPrice,
  formatUnitPrice,
  IS_STATIC,
  Product,
  ProviderInfo,
} from '../api';
import { PROVIDER_LABELS, ProviderTag } from '../components/ProviderTag';

const STALE_HOURS = 36;
// Residential-only shops are refreshed manually, not by the daily CI cron.
const STALE_HOURS_RESIDENTIAL = 7 * 24;

export function Dashboard({ dataVersion }: { dataVersion: number }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [source, setSource] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    api.products().then(setProducts).catch((err) => setError(String(err)));
    api.providers().then(setProviders).catch(() => {});
  }, [dataVersion]);

  const residentialOnly = useMemo(
    () => new Set(providers.filter((p) => p.residentialOnly).map((p) => p.id)),
    [providers],
  );

  const sources = useMemo(() => {
    const ids = new Set<string>();
    for (const p of products ?? []) for (const l of p.links) ids.add(l.provider_id);
    return [...ids].sort();
  }, [products]);

  const categories = useMemo(() => {
    const present = new Set((products ?? []).map((p) => p.category));
    return CATEGORIES.filter((c) => present.has(c));
  }, [products]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const p of products ?? []) {
      if (p.brand) set.add(p.brand);
      for (const l of p.links) if (l.brand) set.add(l.brand);
    }
    return [...set].sort();
  }, [products]);

  const filtered = useMemo(() => {
    if (!products) return null;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    return products.filter((p) => {
      const linkBrands = p.links.map((l) => l.brand ?? '').join(' ');
      const haystack = `${p.name} ${p.brand ?? ''} ${linkBrands} ${p.variant_desc ?? ''} ${p.category}`.toLowerCase();
      if (!tokens.every((t) => haystack.includes(t))) return false;
      if (category && p.category !== category) return false;
      if (brand && p.brand !== brand && !p.links.some((l) => l.brand === brand)) return false;
      if (source && !p.links.some((l) => l.provider_id === source)) return false;
      // Price filter compares the current lowest SGD price.
      const price = p.lowest?.price_sgd;
      if (Number.isFinite(min) && (price == null || price < min)) return false;
      if (Number.isFinite(max) && (price == null || price > max)) return false;
      return true;
    });
  }, [products, query, minPrice, maxPrice, source, category, brand]);

  const sorted = useMemo(() => {
    if (!filtered) return null;
    if (sort === 'newest') return filtered; // server order: created_at DESC
    const rows = [...filtered];
    const price = (p: Product) => p.lowest?.price_sgd ?? null;
    const unit = (p: Product) => p.cheapest_per_unit?.unit_price_sgd ?? null;
    const savings = (p: Product) => p.unit_spread?.pct ?? null;
    const byNullable = (get: (p: Product) => number | null, dir: 1 | -1) => (a: Product, b: Product) => {
      const pa = get(a);
      const pb = get(b);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1; // unpriced rows always last
      if (pb == null) return -1;
      return (pa - pb) * dir;
    };
    if (sort === 'price-asc') rows.sort(byNullable(price, 1));
    else if (sort === 'price-desc') rows.sort(byNullable(price, -1));
    else if (sort === 'unit-asc') rows.sort(byNullable(unit, 1));
    else if (sort === 'savings') rows.sort(byNullable(savings, -1)); // biggest spread first
    else if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [filtered, sort]);

  if (error) return <div className="card error-text">Failed to load products: {error}</div>;
  if (!products || !filtered || !sorted) return <div className="card muted">Loading…</div>;
  if (!products.length) {
    return (
      <div className="card">
        {IS_STATIC ? (
          'No products tracked yet.'
        ) : (
          <>
            No products tracked yet. <Link to="/add">Add your first ingredient</Link> or run{' '}
            <code>npm run seed</code> for a starter catalog.
          </>
        )}
      </div>
    );
  }

  const filtersActive = query || minPrice || maxPrice || source || category || brand;
  const isStale = (l: { provider_id: string; latest_scraped_at: string | null }) => {
    if (!l.latest_scraped_at) return false;
    const limit = residentialOnly.has(l.provider_id) ? STALE_HOURS_RESIDENTIAL : STALE_HOURS;
    return Date.now() - new Date(l.latest_scraped_at + 'Z').getTime() > limit * 3600 * 1000;
  };

  return (
    <div className="card table-scroll">
      <div className="filter-bar">
        <input
          type="search"
          className="filter-search"
          placeholder="Search by name, brand, or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c as Category]}
            </option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All shops</option>
          {sources.map((id) => (
            <option key={id} value={id}>
              {PROVIDER_LABELS[id] ?? id}
            </option>
          ))}
        </select>
        {brands.length > 0 && (
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}
        <label className="muted">
          Price S$
          <input
            type="number"
            min="0"
            step="1"
            className="filter-price"
            placeholder="min"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
          />
        </label>
        <span className="muted">–</span>
        <input
          type="number"
          min="0"
          step="1"
          className="filter-price"
          placeholder="max"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)} title="Sort">
          <option value="newest">Newest first</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          <option value="unit-asc">Cheapest per kg/L</option>
          <option value="savings">Biggest savings</option>
          <option value="name">Name A–Z</option>
        </select>
        {filtersActive && (
          <>
            <span className="muted">
              {filtered.length} of {products.length}
            </span>
            <button
              className="small"
              onClick={() => {
                setQuery('');
                setMinPrice('');
                setMaxPrice('');
                setSource('');
                setCategory('');
                setBrand('');
              }}
            >
              Clear
            </button>
          </>
        )}
      </div>
      {!filtered.length && <p className="muted">No products match the current filters.</p>}
      <table className="responsive-table">
        <thead>
          <tr>
            <th>Ingredient</th>
            <th>Best value</th>
            <th>Prices by shop</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id}>
              <td data-label="Ingredient">
                <div className="ingredient-cell">
                  {p.image_url ? (
                    <img className="ingredient-thumb" src={p.image_url} alt="" loading="lazy" />
                  ) : (
                    <span className="ingredient-thumb placeholder" aria-hidden>🧁</span>
                  )}
                  <div>
                    <Link to={`/products/${p.id}`}><strong>{p.name}</strong></Link>{' '}
                    <span className="category-pill">{CATEGORY_LABELS[p.category] ?? p.category}</span>
                    {p.brand && <span className="brand-pill">{p.brand}</span>}
                    {p.variant_desc && <div className="muted">{p.variant_desc}</div>}
                  </div>
                </div>
              </td>
              <td data-label="Best value">
                {p.cheapest_per_unit ? (
                  <>
                    <div className="best-value-row">
                      <span className="price-chip unit-lowest">
                        {formatUnitPrice(p.cheapest_per_unit.unit_price_sgd, p.cheapest_per_unit.unit_base)}
                      </span>
                      {p.unit_spread && p.unit_spread.pct >= 0.05 && (
                        <span
                          className="savings-badge"
                          title={`vs ${PROVIDER_LABELS[p.unit_spread.dearest_provider_id] ?? p.unit_spread.dearest_provider_id} — the dearest shop per ${p.unit_spread.unit_base === 'pcs' ? 'piece' : p.unit_spread.unit_base}`}
                        >
                          save {Math.round(p.unit_spread.pct * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="muted">
                      at <a href={p.cheapest_per_unit.url} target="_blank" rel="noreferrer">{PROVIDER_LABELS[p.cheapest_per_unit.provider_id] ?? p.cheapest_per_unit.provider_id}</a>
                    </div>
                    {p.lowest && (
                      <div className="muted">
                        lowest pack {formatDualPrice(p.lowest.price_sgd, p.lowest.price, p.lowest.currency)}
                      </div>
                    )}
                  </>
                ) : p.lowest ? (
                  <>
                    <span className="price-chip lowest">
                      {formatDualPrice(p.lowest.price_sgd, p.lowest.price, p.lowest.currency)}
                    </span>
                    <div className="muted">
                      at <a href={p.lowest.url} target="_blank" rel="noreferrer">{PROVIDER_LABELS[p.lowest.provider_id] ?? p.lowest.provider_id}</a>
                      <span title="pack size unknown, so no per-unit comparison"> · pack price</span>
                    </div>
                  </>
                ) : (
                  <span className="muted">no data yet</span>
                )}
              </td>
              <td data-label="Prices by shop">
                {p.links.map((l) => (
                  <div key={l.id} style={{ marginBottom: 4 }}>
                    <ProviderTag id={l.provider_id} />
                    {l.brand && <span className="brand-pill">{l.brand}</span>}
                    {l.latest_price != null ? (
                      <span className="price-chip" title={l.latest_scraped_at ?? ''}>
                        {formatDualPrice(l.latest_price_sgd, l.latest_price, l.latest_currency!)}
                        {l.unit_price_sgd != null && (
                          <span className="muted"> · {formatUnitPrice(l.unit_price_sgd, l.unit_base)}</span>
                        )}
                        {l.latest_in_stock === 0 && <span className="error-text"> (out of stock)</span>}
                        {isStale(l) && <span className="muted" title="price data is old"> ⏱</span>}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
