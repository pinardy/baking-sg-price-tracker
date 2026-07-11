import { useEffect, useRef, useState } from 'react';
import { api, FetchStatus, IS_STATIC } from '../api';

export function FetchStatusBar({ onRunFinished }: { onRunFinished: () => void }) {
  const [status, setStatus] = useState<FetchStatus | null>(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const poll = async () => {
      try {
        const next = await api.fetchStatus();
        if (cancelled) return;
        setStatus(next);
        if (IS_STATIC) return; // static snapshot never changes within a page load
        if (wasRunning.current && !next.running) onRunFinished();
        wasRunning.current = next.running;
        timer = setTimeout(poll, next.running ? 1500 : 30_000);
      } catch {
        if (!cancelled && !IS_STATIC) timer = setTimeout(poll, 30_000);
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onRunFinished]);

  const refresh = async () => {
    await api.startFetch();
    setStatus((s) => (s ? { ...s, running: true } : s));
    wasRunning.current = true;
  };

  const last = status?.lastRun;
  const errors: { linkId: number; message: string }[] = last?.error_log
    ? JSON.parse(last.error_log)
    : [];

  return (
    <div className="status-bar">
      {status?.running ? (
        <span><span className="spinner" /> fetching prices…</span>
      ) : last?.finished_at ? (
        <span title={errors.map((e) => `link ${e.linkId}: ${e.message}`).join('\n')}>
          Last fetch: {new Date(last.finished_at + 'Z').toLocaleString()} · {last.ok_count} ok
          {last.error_count > 0 && (
            <span className="error-text"> · {last.error_count} errors</span>
          )}
        </span>
      ) : (
        <span>No fetches yet</span>
      )}
      {!IS_STATIC && (
        <button className="small" onClick={refresh} disabled={status?.running}>
          Refresh prices
        </button>
      )}
    </div>
  );
}
