/**
 * Where the screen gets its tasks, without secrets in the public bundle: open the app once with
 *   https://<app>/#tasks=<https url of the dashboard json>&key=<read token>&act=<action token>
 * and it remembers both on this device (localStorage) and removes them from the address bar. Both tokens are optional; without `act` the screen can only look.
 */
import type { KeyValueStore } from './spotify/auth';

export interface TasksConnection {
  url: string; token: string | null;
  /** Where to send "done" and "undo". Derived from the state url (.../state -> .../action); null = the screen is read-only. */
  actionUrl: string | null; actionToken: string | null;
}
const K = 'dashy.tasks';
const TOKEN = /^[A-Za-z0-9._~+\/=-]{8,200}$/;
const okUrl = (s: string) => { try { const u = new URL(s); return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)); } catch { return false; } };

/** .../api/state -> .../api/action (same place, same origin). null when the url does not end in /state. */
export function actionUrlOf(stateUrl: string): string | null {
  try { const u = new URL(stateUrl); if (!/\/state\/?$/.test(u.pathname)) return null; u.pathname = u.pathname.replace(/\/state\/?$/, '/action'); u.search = ''; u.hash = ''; return u.toString(); } catch { return null; }
}
export function adoptTasksHash(hash: string, store: KeyValueStore): { cleaned: string; adopted: boolean } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const url = params.get('tasks'), key = params.get('key'), act = params.get('act');
  if (!url || !okUrl(url)) return { cleaned: hash, adopted: false };
  store.set(K, JSON.stringify({ url, key: key && TOKEN.test(key) ? key : null, act: act && TOKEN.test(act) ? act : null }));
  params.delete('tasks'); params.delete('key'); params.delete('act');
  const rest = params.toString();
  return { cleaned: rest ? `#${rest}` : '', adopted: true };
}
export function loadTasksConnection(store: KeyValueStore): TasksConnection | null {
  try {
    const raw = store.get(K); if (!raw) return null;
    const v = JSON.parse(raw) as { url?: unknown; key?: unknown; act?: unknown };
    if (typeof v.url !== 'string' || !okUrl(v.url)) return null;
    const act = typeof v.act === 'string' && TOKEN.test(v.act) ? v.act : null;
    return { url: v.url, token: typeof v.key === 'string' && TOKEN.test(v.key) ? v.key : null, actionToken: act, actionUrl: act ? actionUrlOf(v.url) : null };
  } catch { return null; }
}
export const forgetTasksConnection = (store: KeyValueStore) => store.remove(K);

/**
 * For windows without an address bar (the Mac app): accept what the user pastes, either the whole link
 * (https://<app>/#tasks=...&key=...&act=...) or just the part from the #. Returns true when it was a valid link and is now remembered.
 */
export function adoptPastedLink(text: string, store: KeyValueStore): boolean {
  const t = text.trim();
  let hash = '';
  try { hash = t.startsWith('#') ? t : new URL(t).hash; } catch { return false; }
  return adoptTasksHash(hash, store).adopted;
}

export type PairResult = 'ok' | 'wrong' | 'offline' | 'unavailable';
/**
 * Link this screen with a pairing code (Claude's tool `pairing_code`) instead of a long link. Sends the code to `<base>/api/pair`
 * and remembers the keys it answers with, the same way as the #tasks= link does.
 */
export async function pairWithCode(code: string, base: string, store: KeyValueStore, f: typeof fetch = fetch): Promise<PairResult> {
  try {
    const res = await f(new URL('/api/pair', base).toString(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    if (res.status === 401) return 'wrong';
    if (!res.ok) return 'unavailable';
    const v = await res.json() as { url?: unknown; key?: unknown; act?: unknown };
    if (typeof v.url !== 'string' || typeof v.key !== 'string') return 'unavailable';
    const p = new URLSearchParams({ tasks: v.url, key: v.key }); if (typeof v.act === 'string') p.set('act', v.act);
    return adoptTasksHash(`#${p}`, store).adopted ? 'ok' : 'unavailable';
  } catch { return 'offline'; }
}
