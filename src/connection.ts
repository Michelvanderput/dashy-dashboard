/**
 * How the screen learns where its data lives, without secrets in the public bundle:
 * open the app once with  https://<app>/#key=<read token>&act=<action token>  (a desktop shell adds &api=https://<site>) and it remembers both on this device
 * (localStorage), then removes them from the address bar. The endpoints are on the same site (/api/...).
 */
import type { KeyValueStore } from './spotify/auth';

/** `api` is the site that serves /api/... when the app itself runs elsewhere (a desktop shell); empty = this site. */
export interface Connection { stateUrl: string; actionUrl: string; token: string; actionToken: string | null }
const K = 'dashy.connection';
/** https only (or http on localhost for development), a bare origin, nothing else. */
const API = /^(https:\/\/[A-Za-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1))(:\d{1,5})?$/;
const TOKEN = /^[A-Za-z0-9._~+\/=-]{8,200}$/;

/** Reads `#key=…&act=…` from a hash and remembers it. Returns the hash without those parts (to put back in the address bar). */
export function adoptHash(hash: string, store: KeyValueStore): { cleaned: string; adopted: boolean } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const key = params.get('key'), act = params.get('act'), api = params.get('api');
  if (!key || !TOKEN.test(key)) return { cleaned: hash, adopted: false };
  store.set(K, JSON.stringify({ key, act: act && TOKEN.test(act) ? act : null, api: api && API.test(api) ? api : null }));
  params.delete('key'); params.delete('act'); params.delete('api');
  const rest = params.toString();
  return { cleaned: rest ? `#${rest}` : '', adopted: true };
}

export function loadConnection(store: KeyValueStore, origin: string): Connection | null {
  try {
    const raw = store.get(K);
    if (!raw) return null;
    const v = JSON.parse(raw) as { key?: unknown; act?: unknown; api?: unknown };
    if (typeof v.key !== 'string' || !TOKEN.test(v.key)) return null;
    const base = typeof v.api === 'string' && API.test(v.api) ? v.api : origin;
    return { stateUrl: `${base}/api/dashy-state`, actionUrl: `${base}/api/dashy-action`, token: v.key, actionToken: typeof v.act === 'string' && TOKEN.test(v.act) ? v.act : null };
  } catch { return null; }
}
export const forgetConnection = (store: KeyValueStore) => store.remove(K);

/**
 * For a desktop shell, where there is no link to open: the same hash, built from what the person types in the connect form.
 * Returns null when something is missing or not acceptable. The site must be an https origin (or localhost); a trailing slash is fine.
 */
export function connectionHash(i: { site: string; key: string; act?: string }): string | null {
  const site = i.site.trim().replace(/\/+$/, ''), key = i.key.trim(), act = (i.act ?? '').trim();
  if (!API.test(site) || !TOKEN.test(key) || (act && !TOKEN.test(act))) return null;
  const p = new URLSearchParams({ key, ...(act ? { act } : {}), api: site });
  return `#${p.toString()}`;
}
