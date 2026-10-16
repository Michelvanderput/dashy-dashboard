/**
 * Where the screen gets its tasks, without secrets in the public bundle: open the app once with
 *   https://<app>/#tasks=<https url of the dashboard json>&key=<read token>
 * and it remembers both on this device (localStorage) and removes them from the address bar. The token is optional.
 */
import type { KeyValueStore } from './spotify/auth';

export interface TasksConnection { url: string; token: string | null }
const K = 'dashy.tasks';
const TOKEN = /^[A-Za-z0-9._~+\/=-]{8,200}$/;
const okUrl = (s: string) => { try { const u = new URL(s); return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)); } catch { return false; } };

export function adoptTasksHash(hash: string, store: KeyValueStore): { cleaned: string; adopted: boolean } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const url = params.get('tasks'), key = params.get('key');
  if (!url || !okUrl(url)) return { cleaned: hash, adopted: false };
  store.set(K, JSON.stringify({ url, key: key && TOKEN.test(key) ? key : null }));
  params.delete('tasks'); params.delete('key');
  const rest = params.toString();
  return { cleaned: rest ? `#${rest}` : '', adopted: true };
}
export function loadTasksConnection(store: KeyValueStore): TasksConnection | null {
  try {
    const raw = store.get(K); if (!raw) return null;
    const v = JSON.parse(raw) as { url?: unknown; key?: unknown };
    if (typeof v.url !== 'string' || !okUrl(v.url)) return null;
    return { url: v.url, token: typeof v.key === 'string' && TOKEN.test(v.key) ? v.key : null };
  } catch { return null; }
}
export const forgetTasksConnection = (store: KeyValueStore) => store.remove(K);
