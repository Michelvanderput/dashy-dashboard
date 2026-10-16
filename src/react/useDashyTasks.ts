import { useEffect, useRef, useState } from 'react';
import { parseDashboard, snapshotEvents, TASK_DRIVER_CONFIG, type DashboardSnapshot } from '../tasks';
import { useStateDriver } from './useStateDriver';
import type { Resolution } from '../driver';

export interface UseDashyTasksOptions {
  /** URL of the dashboard JSON. undefined = not connected: Dashy stays calm and `connected` is false. */
  url?: string;
  token?: string | null;
  /** Default 30 s. Paused while the window is hidden. */
  intervalMs?: number;
  fetch?: typeof fetch;
}
export interface DashyTasks extends Resolution { snapshot: DashboardSnapshot | null; connected: boolean; error: string | null }

/** Polls the dashboard and feeds the changes to the driver, so Dashy's state follows your real tasks. A failed poll keeps the last picture and shows an error text; it never throws. */
export function useDashyTasks({ url, token, intervalMs = 30_000, fetch: f }: UseDashyTasksOptions): DashyTasks {
  const driver = useStateDriver(TASK_DRIVER_CONFIG);
  const dispatch = useRef(driver.dispatch); dispatch.current = driver.dispatch;
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prev = useRef<DashboardSnapshot | null>(null);

  useEffect(() => {
    if (!url) { prev.current = null; setSnapshot(null); setError(null); return; }
    let stop = false, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stop) return;
      if (typeof document !== 'undefined' && document.hidden) { timer = setTimeout(tick, intervalMs); return; }
      const ctl = new AbortController(), kill = setTimeout(() => ctl.abort(), 8000);
      try {
        const res = await (f ?? fetch)(url, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: ctl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Geen toegang: controleer de sleutel' : `Dashboard gaf status ${res.status}`);
        const next = parseDashboard(await res.text());
        if (stop) return;
        for (const e of snapshotEvents(prev.current, next)) dispatch.current(e);
        prev.current = next; setSnapshot(next); setError(null);
      } catch (e) { if (!stop) setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'Dashboard niet bereikbaar'); }
      finally { clearTimeout(kill); }
      if (!stop) timer = setTimeout(tick, intervalMs);
    };
    void tick();
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); void tick(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [url, token, intervalMs, f]);

  return { state: driver.state, rule: driver.rule, snapshot, connected: !!url, error };
}
