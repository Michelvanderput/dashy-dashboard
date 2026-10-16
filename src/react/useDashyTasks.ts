import { useEffect, useRef, useState } from 'react';
import { FREE_TIME_DRIVER_CONFIG, parseDashboard, snapshotEvents, TASK_DRIVER_CONFIG, type DashboardSnapshot } from '../tasks';
import { useStateDriver } from './useStateDriver';
import type { Resolution } from '../driver';

export interface UseDashyTasksOptions {
  /** Where "done" and "undo" go, with its own (write-limited) token. Without it `complete` is undefined: the screen only looks. */
  actionUrl?: string | null;
  actionToken?: string | null;
  /** URL of the dashboard JSON. undefined = not connected: Dashy stays calm and `connected` is false. */
  url?: string;
  token?: string | null;
  /** Default 10 s. Paused while the window is hidden, and it looks again at once when the window comes back (visible, focus, pageshow, online). */
  intervalMs?: number;
  fetch?: typeof fetch;
}
export interface DashyTasks extends Resolution {
  snapshot: DashboardSnapshot | null; connected: boolean; error: string | null;
  /** Check a task off. Shows at once, then the server confirms; when it does not work the task comes back and `error` says so. undefined = read-only. */
  complete?: (id: string) => Promise<boolean>;
  /** Take the last check-off back. undefined when there is nothing to undo or the screen is read-only. */
  undo?: () => Promise<boolean>;
  /** The task that was just checked off (for an "Ongedaan maken" button), until `UNDO_MS` has passed. */
  justDone: { id: string; title: string } | null;
  /** When the dashboard was last read successfully (ms), so the screen can say it is out of date instead of silently showing old tasks. */
  lastOkAt: number | null;
  /** True when the last successful read is more than 90 s old (the screen is probably not live). Re-evaluated every 30 s. */
  stale: boolean;
}
export const UNDO_MS = 8000;

/** Polls the dashboard and feeds the changes to the driver, so Dashy's state follows your real tasks. A failed poll keeps the last picture and shows an error text; it never throws. */
export function useDashyTasks({ url, token, actionUrl, actionToken, intervalMs = 10_000, fetch: f }: UseDashyTasksOptions): DashyTasks {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const driver = useStateDriver(snapshot?.mode === 'free' ? FREE_TIME_DRIVER_CONFIG : TASK_DRIVER_CONFIG);
  const dispatch = useRef(driver.dispatch); dispatch.current = driver.dispatch;
  const [error, setError] = useState<string | null>(null);
  const prev = useRef<DashboardSnapshot | null>(null);
  const [justDone, setJustDone] = useState<{ id: string; title: string } | null>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [, setBeat] = useState(0);
  useEffect(() => { const id = setInterval(() => setBeat(n => n + 1), 30_000); return () => clearInterval(id); }, []);
  const busy = useRef(0); // while an action is in flight a poll answer could be older than the action, so it is ignored

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
        if (stop || busy.current > 0) return;
        for (const e of snapshotEvents(prev.current, next)) dispatch.current(e);
        prev.current = next; setSnapshot(next); setError(null); setLastOkAt(Date.now());
      } catch (e) { if (!stop) setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'Dashboard niet bereikbaar'); }
      finally { clearTimeout(kill); }
      if (!stop) timer = setTimeout(tick, intervalMs);
    };
    void tick();
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); void tick(); } };
    // iOS home-screen apps and laptops waking up do not always fire visibilitychange: also listen for focus, pageshow and online
    const again = () => { if (typeof document === 'undefined' || !document.hidden) { clearTimeout(timer); void tick(); } };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', again); window.addEventListener('pageshow', again); window.addEventListener('online', again);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', again); window.removeEventListener('pageshow', again); window.removeEventListener('online', again); };
  }, [url, token, intervalMs, f]);

  useEffect(() => { if (!justDone) return; const id = setTimeout(() => setJustDone(null), UNDO_MS); return () => clearTimeout(id); }, [justDone]);

  const canAct = !!url && !!actionUrl && !!actionToken;
  /** Apply a snapshot we already hold: tell the driver what changed, then show it. */
  const show = (next: DashboardSnapshot) => { for (const e of snapshotEvents(prev.current, next)) dispatch.current(e); prev.current = next; setSnapshot(next); };
  const send = async (action: 'done' | 'undo', id: string): Promise<DashboardSnapshot> => {
    const ctl = new AbortController(), kill = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await (f ?? fetch)(actionUrl!, { method: 'POST', headers: { authorization: `Bearer ${actionToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ action, id }), signal: ctl.signal, cache: 'no-store' });
      if (res.status === 401 || res.status === 403) throw new Error('Geen toegang om af te vinken: controleer de sleutel');
      if (res.status === 404) throw new Error('Die taak bestaat niet meer');
      if (!res.ok) throw new Error(`Afvinken gaf status ${res.status}`);
      return parseDashboard(await res.text());
    } finally { clearTimeout(kill); }
  };
  const complete = async (id: string): Promise<boolean> => {
    const before = prev.current, task = before?.tasks.find(t => t.id === id);
    if (!before || !task) return false;
    busy.current++;
    show({ ...before, tasks: before.tasks.filter(t => t.id !== id), leftOpen: before.leftOpen.filter(x => x !== id) }); // at once; he celebrates now, not after the round trip
    setJustDone({ id, title: task.title }); setError(null);
    try { show(await send('done', id)); return true; }
    catch (e) { show(before); setJustDone(null); setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'Afvinken lukte niet: geen verbinding'); return false; }
    finally { busy.current--; }
  };
  const undo = async (): Promise<boolean> => {
    if (!justDone) return false;
    busy.current++;
    try { show(await send('undo', justDone.id)); setJustDone(null); setError(null); return true; }
    catch (e) { setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'Ongedaan maken lukte niet: geen verbinding'); return false; }
    finally { busy.current--; }
  };

  return { state: driver.state, rule: driver.rule, snapshot, connected: !!url, error, justDone, lastOkAt, stale: lastOkAt !== null && Date.now() - lastOkAt > 90_000, complete: canAct ? complete : undefined, undo: canAct && justDone ? undo : undefined };
}
