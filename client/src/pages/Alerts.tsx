import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, api, formatPrice, IS_STATIC } from '../api';
import { ProviderTag } from '../components/ProviderTag';

export function Alerts({ onChanged }: { onChanged: () => void }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    api.alerts(!showAll).then(setAlerts).catch(() => setAlerts([]));
  }, [showAll]);

  useEffect(load, [load]);

  const ack = async (id: number) => {
    await api.ackAlert(id);
    load();
    onChanged();
  };

  const ackAll = async () => {
    await api.ackAllAlerts();
    load();
    onChanged();
  };

  if (!alerts) return <div className="card muted">Loading…</div>;

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Price-drop alerts</h2>
        <label className="muted" style={{ marginRight: 12 }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />{' '}
          show acknowledged
        </label>
        {!IS_STATIC && alerts.some((a) => !a.acknowledged) && (
          <button className="small" onClick={ackAll}>Acknowledge all</button>
        )}
      </div>
      {!alerts.length && <p className="muted">No alerts. Set a target price on a product to get one when a source drops below it.</p>}
      <table className="responsive-table">
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.id} style={alert.acknowledged ? { opacity: 0.55 } : undefined}>
              <td data-label="Product">
                <Link to={`/products/${alert.product_id}`}><strong>{alert.product_name}</strong></Link>
                <div className="muted">{new Date(alert.created_at + 'Z').toLocaleString()}</div>
              </td>
              <td data-label="Price vs target">
                {alert.provider_id && <ProviderTag id={alert.provider_id} />}
                <span className="price-chip lowest">{formatPrice(alert.price, alert.currency)}</span>
                <span className="muted"> ≤ target {formatPrice(alert.target_price, alert.currency)}</span>
              </td>
              <td>
                {alert.link_url && (
                  <a href={alert.link_url} target="_blank" rel="noreferrer">buy ↗</a>
                )}
              </td>
              <td style={{ textAlign: 'right' }}>
                {!IS_STATIC && !alert.acknowledged && (
                  <button className="small" onClick={() => ack(alert.id)}>Acknowledge</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
