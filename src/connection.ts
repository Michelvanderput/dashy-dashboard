/**
 * How the screen learns where its data lives, without secrets in the public bundle:
 * open the app once with  https://<app>/#key=<read token>&act=<action token>  and it remembers both on this device
 * (localStorage), then removes them from the address bar. The endpoints are on the same site (/api/...).
 */
import type { KeyValueStore } from './spotify/auth';

export interface Connection { stateUrl: string; actionUrl: string; token: string; actionToken: string | null }
const K = 'dashy.connection';
const TOKEN = /^[A-Za-z0-9._~+\/=-]{8,200}$/;

/** Reads `#key=…&act=…` from a hash and remembers it. Returns the hash without those parts (to put back in the address bar). */
export function adoptHash(hash: string, store: KeyValueStore): { cleaned: string; adopted: boolean } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const key = params.get('key'), act = params.get('act');
  if (!key || !TOKEN.test(key)) return { cleaned: hash, adopted: false };
  store.set(K, JSON.stringify({ key, act: act && TOKEN.test(act) ? act : null }));
  params.delete('key'); params.delete('act');
  const rest = params.toString();
  return { cleaned: rest ? `#${rest}` : '', adopted: true };
}

export function loadConnection(store: KeyValueStore, origin: string): Connection | null {
  try {
    const raw = store.get(K);
    if (!raw) return null;
    const v = JSON.parse(raw) as { key?: unknown; act?: unknown };
    if (typeof v.key !== 'string' || !TOKEN.test(v.key)) return null;
    return { stateUrl: `${origin}/api/dashy-state`, actionUrl: `${origin}/api/dashy-action`, token: v.key, actionToken: typeof v.act === 'string' && TOKEN.test(v.act) ? v.act : null };
  } catch { return null; }
}
export const forgetConnection = (store: KeyValueStore) => store.remove(K);
