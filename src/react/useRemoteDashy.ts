import { useEffect, useState } from 'react';
import { CALM, fetchDashyState, type RemoteState, type StateClientOptions } from '../state-client';

export interface RemoteOptions extends StateClientOptions {
  /** How often to ask when nothing is expected to change. Default 15 s. */
  intervalMs?: number;
}

/**
 * Polls the state endpoint and returns what Dashy should show. Asks sooner when the server says the answer changes
 * by itself at a known moment (nextWakeAt), and stops asking while the window is hidden.
 */
export function useRemoteDashy(o: RemoteOptions): RemoteState {
  const [s, setS] = useState<RemoteState>({ ...CALM });
  const { url, token, intervalMs = 15_000, timeoutMs, fetch: f } = o;
  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stop) return;
      if (typeof document !== 'undefined' && document.hidden) { timer = setTimeout(tick, intervalMs); return; }
      const next = await fetchDashyState({ url, token, timeoutMs, fetch: f });
      if (stop) return;
      setS(prev => (prev.state === next.state && prev.line === next.line && prev.source === next.source ? prev : next));
      const until = next.nextWakeAt === null ? intervalMs : Math.max(1000, Math.min(intervalMs, next.nextWakeAt - Date.now() + 50));
      timer = setTimeout(tick, until);
    };
    void tick();
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); void tick(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [url, token, intervalMs, timeoutMs, f]);
  return s;
}
