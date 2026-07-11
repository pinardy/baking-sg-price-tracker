import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  CATEGORY_LABELS,
  formatDualPrice,
  formatPackSize,
  formatPrice,
  formatUnitPrice,
  HistoryPoint,
  IS_STATIC,
  PackUnit,
  Product,
  ProductLink,
  SearchResult,
} from '../api';
import { ProviderTag } from '../components/ProviderTag';
import { SourceSearchPanel } from '../components/SourceSearchPanel';

// Recharts is ~half the bundle; load it only when a product page is opened.
const PriceHistoryChart = lazy(() =>
  import('../components/PriceHistoryChart').then((m) => ({ default: m.PriceHistoryChart })),
);

const RANGES = [30, 90, 365];
const PACK_UNITS: PackUnit[] = ['g', 'kg', 'ml', 'l', 'pcs'];

export function ProductDetail({ dataVersion }: { dataVersion: number }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Omit<Product, 'lowest' | 'cheapest_per_unit'> | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [days, setDays] = useState(90);
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [pendingPicks, setPendingPicks] = useState<SearchResult[]>([]);
  const [targetInput, setTargetInput] = useState('');
  const [editingPackLink, setEditingPackLink] = useState<number | null>(null);
  const [packQtyInput, setPackQtyInput] = useState('');
  const [packUnitInput, setPackUnitInput] = useState<PackUnit>('g');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    api.product(id).then((p) => {
      setProduct(p);
      setTargetInput(p.target_price != null ? String(p.target_price) : '');
    }).catch((err) => setError(String(err)));
    api.history(id, days).then(setHistory).catch(() => {});
  }, [id, days]);

  useEffect(load, [load, dataVersion]);

  // No marketplace providers at launch; kept so the chart's dashed-line
  // treatment works if one is ever added.
  const marketplaceLinkIds = useMemo(() => new Set<number>(), []);

  if (error) return <div className="card error-text">{error}</div>;
  if (!product) return <div className="card muted">Loading…</div>;

  const saveTarget = async () => {
    const value = targetInput.trim() ? parseFloat(targetInput) : null;
    await api.patchProduct(product.id, { target_price: value });
    load();
  };

  const removeProduct = async () => {
    if (!window.confirm(`Stop tracking "${product.name}"? Price history is kept.`)) return;
    await api.deleteProduct(product.id);
    navigate('/');
  };

  const addPickedLinks = async () => {
    for (const pick of pendingPicks) {
      await api.addLink(product.id, pick);
    }
    setShowLinkSearch(false);
    setPendingPicks([]);
    load();
  };

  const removeLink = async (link: ProductLink) => {
    if (!window.confirm(`Remove ${link.provider_id} link? Its history is kept.`)) return;
    await api.removeLink(link.id);
    load();
  };

  const startPackEdit = (link: ProductLink) => {
    setEditingPackLink(link.id);
    setPackQtyInput(link.pack_qty != null ? String(link.pack_qty) : '');
    setPackUnitInput(link.pack_unit ?? 'g');
  };

  const savePackEdit = async (linkId: number) => {
    const qty = packQtyInput.trim() ? parseFloat(packQtyInput) : null;
    await api.patchLink(linkId, { pack_qty: qty, pack_unit: qty == null ? null : packUnitInput });
    setEditingPackLink(null);
    load();
  };

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{product.name}</h2>
          <span className="category-pill">{CATEGORY_LABELS[product.category] ?? product.category}</span>
          <span style={{ flex: 1 }} />
          {!IS_STATIC && <button className="small" onClick={removeProduct}>Stop tracking</button>}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          {[product.brand, product.variant_desc].filter(Boolean).join(' · ')}
          {' · '}<Link to="/">back to dashboard</Link>
        </p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h3 style={{ margin: 0, flex: 1 }}>Price history</h3>
          {RANGES.map((r) => (
            <button
              key={r}
              className="small"
              style={days === r ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              onClick={() => setDays(r)}
            >
              {r}d
            </button>
          ))}
        </div>
        <Suspense fallback={<div className="muted">Loading chart…</div>}>
          <PriceHistoryChart history={history} marketplaceLinkIds={marketplaceLinkIds} />
        </Suspense>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Price-drop alert</h3>
        {IS_STATIC ? (
          <p className="muted" style={{ margin: 0 }}>
            {product.target_price != null
              ? <>Alerts fire when any price is at or below <strong>{formatPrice(product.target_price, 'SGD')}</strong>.</>
              : 'No target price set.'}
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted">Alert when any price (converted to SGD) is at or below S$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              style={{ width: 120 }}
              placeholder="no target"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
            />
            <button className="primary small" onClick={saveTarget}>Save</button>
            {product.target_price != null && (
              <button className="small" onClick={() => { setTargetInput(''); void api.patchProduct(product.id, { target_price: null }).then(load); }}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, flex: 1 }}>Shops ({product.links.length})</h3>
          {!IS_STATIC && (
            <button className="small" onClick={() => setShowLinkSearch((s) => !s)}>
              {showLinkSearch ? 'Cancel' : '+ Add shop'}
            </button>
          )}
        </div>
        <table className="responsive-table">
          <thead>
            <tr><th>Shop</th><th>Listing</th><th>Pack</th><th>Latest price</th>{!IS_STATIC && <th />}</tr>
          </thead>
          <tbody>
            {product.links.map((link) => (
              <tr key={link.id}>
                <td data-label="Shop"><ProviderTag id={link.provider_id} /></td>
                <td data-label="Listing">
                  <div className="listing-cell">
                    {link.image_url && <img className="listing-thumb" src={link.image_url} alt="" loading="lazy" />}
                    <div>
                      <a href={link.url} target="_blank" rel="noreferrer">
                        {link.title ?? link.query ?? link.url}
                      </a>
                      {link.brand && <span className="brand-pill">{link.brand}</span>}
                      {link.query && <div className="muted">tracked query: “{link.query}”</div>}
                    </div>
                  </div>
                </td>
                <td data-label="Pack">
                  {editingPackLink === link.id ? (
                    <span style={{ whiteSpace: 'nowrap' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        style={{ width: 70 }}
                        value={packQtyInput}
                        onChange={(e) => setPackQtyInput(e.target.value)}
                      />{' '}
                      <select value={packUnitInput} onChange={(e) => setPackUnitInput(e.target.value as PackUnit)}>
                        {PACK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>{' '}
                      <button className="primary small" onClick={() => savePackEdit(link.id)}>Save</button>{' '}
                      <button className="small" onClick={() => setEditingPackLink(null)}>Cancel</button>
                    </span>
                  ) : (
                    <>
                      {formatPackSize(link.pack_qty, link.pack_unit) ?? <span className="muted">unknown</span>}
                      {link.pack_source === 'manual' && <span className="muted" title="manually set"> ✎</span>}
                      {!IS_STATIC && (
                        <button className="small" style={{ marginLeft: 6 }} onClick={() => startPackEdit(link)}>
                          edit
                        </button>
                      )}
                    </>
                  )}
                </td>
                <td data-label="Latest price">
                  {link.latest_price != null ? (
                    <>
                      <span className="price-chip">
                        {formatDualPrice(link.latest_price_sgd, link.latest_price, link.latest_currency!)}
                      </span>
                      {link.unit_price_sgd != null && (
                        <div className="muted">{formatUnitPrice(link.unit_price_sgd, link.unit_base)}</div>
                      )}
                      {link.latest_in_stock === 0 && <div className="error-text">out of stock</div>}
                      <div className="muted">{link.latest_scraped_at && new Date(link.latest_scraped_at + 'Z').toLocaleString()}</div>
                    </>
                  ) : (
                    <span className="muted">not fetched yet</span>
                  )}
                </td>
                {!IS_STATIC && (
                  <td><button className="small" onClick={() => removeLink(link)}>Remove</button></td>
                )}
              </tr>
            ))}
            {!product.links.length && (
              <tr><td colSpan={IS_STATIC ? 4 : 5} className="muted">No shops linked yet.</td></tr>
            )}
          </tbody>
        </table>
        {showLinkSearch && (
          <div style={{ marginTop: 16 }}>
            <SourceSearchPanel onSelectionChange={setPendingPicks} initialQuery={product.name} />
            <button className="primary" disabled={!pendingPicks.length} onClick={addPickedLinks}>
              Add {pendingPicks.length || ''} selected shop{pendingPicks.length === 1 ? '' : 's'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
