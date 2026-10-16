/**
 * Spotify Authorization Code flow with PKCE: no client secret, so it is safe to run inside a web or desktop app.
 * Everything that touches the outside (storage, network, navigation, time) is passed in, so it can be tested.
 */
export const SCOPES = ['user-read-currently-playing'] as const;
const AUTHORIZE = 'https://accounts.spotify.com/authorize';
const TOKEN = 'https://accounts.spotify.com/api/token';

export interface TokenSet { accessToken: string; refreshToken: string; /** ms epoch */ expiresAt: number }
export interface KeyValueStore { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }

export class AuthError extends Error {
  constructor(public readonly reason: 'denied' | 'state' | 'expired' | 'exchange' | 'redirect', message: string) { super(message); }
}

/** Spotify accepts https, or http on a loopback IP literal. `localhost` is rejected. */
export function checkRedirectUri(uri: string): void {
  let u: URL;
  try { u = new URL(uri); } catch { throw new AuthError('redirect', 'redirect URI is not a valid URL'); }
  const loopback = u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol === 'https:' || (u.protocol === 'http:' && loopback)) return;
  throw new AuthError('redirect', u.hostname === 'localhost'
    ? 'Spotify does not allow "localhost" as redirect URI: use http://127.0.0.1:PORT/...'
    : 'redirect URI must be https (or http on 127.0.0.1 / [::1])');
}

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
/** `length` characters (43-128 for a verifier) from the unreserved set, without modulo bias. */
export function randomString(length = 96, getRandomValues: (a: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = a => crypto.getRandomValues(a)): string {
  const limit = 256 - (256 % UNRESERVED.length); // bytes at or above this would favour the first characters
  let out = '';
  while (out.length < length) {
    for (const b of getRandomValues(new Uint8Array(length))) { if (b < limit && out.length < length) out += UNRESERVED[b % UNRESERVED.length]; }
  }
  return out;
}
export const base64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function challengeFor(verifier: string): Promise<string> {
  return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

export function buildAuthorizeUrl(o: { clientId: string; redirectUri: string; state: string; challenge: string; scopes?: readonly string[] }): string {
  const q = new URLSearchParams({
    client_id: o.clientId, response_type: 'code', redirect_uri: o.redirectUri, state: o.state,
    code_challenge_method: 'S256', code_challenge: o.challenge, scope: (o.scopes ?? SCOPES).join(' '),
  });
  return `${AUTHORIZE}?${q}`;
}

const PENDING = 'dashy.spotify.pending';
const TOKENS = 'dashy.spotify.tokens';

export async function beginLogin(o: { clientId: string; redirectUri: string; pending: KeyValueStore; navigate: (url: string) => void }): Promise<void> {
  checkRedirectUri(o.redirectUri);
  const verifier = randomString(), state = randomString(32);
  o.pending.set(PENDING, JSON.stringify({ verifier, state, redirectUri: o.redirectUri }));
  o.navigate(buildAuthorizeUrl({ clientId: o.clientId, redirectUri: o.redirectUri, state, challenge: await challengeFor(verifier) }));
}

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
async function tokenRequest(body: Record<string, string>, f: typeof fetch, now: number, prev?: string): Promise<TokenSet> {
  const res = await f(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form(body) });
  let j: any = null;
  try { j = await res.json(); } catch { /* handled below */ }
  if (!res.ok) throw new AuthError(j?.error === 'invalid_grant' ? 'expired' : 'exchange', `token request failed (${res.status}${j?.error ? ' ' + j.error : ''})`);
  if (typeof j?.access_token !== 'string' || typeof j?.expires_in !== 'number') throw new AuthError('exchange', 'unexpected token response');
  // Spotify may leave the refresh token out when refreshing: keep using the old one.
  const refreshToken = typeof j.refresh_token === 'string' ? j.refresh_token : prev;
  if (!refreshToken) throw new AuthError('exchange', 'no refresh token received');
  return { accessToken: j.access_token, refreshToken, expiresAt: now + j.expires_in * 1000 };
}

/** Call with the URL Spotify redirected back to. Throws AuthError (never leaks codes or tokens into the message). */
export async function completeLogin(o: { clientId: string; callbackUrl: string; pending: KeyValueStore; fetch: typeof fetch; now: number }): Promise<TokenSet> {
  const raw = o.pending.get(PENDING);
  o.pending.remove(PENDING); // single use, whatever happens next
  const q = new URL(o.callbackUrl).searchParams;
  let p: { verifier: string; state: string; redirectUri: string } | null = null;
  try { p = raw ? JSON.parse(raw) : null; } catch { p = null; }
  if (!p || !q.get('state') || q.get('state') !== p.state) throw new AuthError('state', 'login was not started here or the state does not match');
  if (q.get('error')) throw new AuthError('denied', 'access was denied');
  const code = q.get('code');
  if (!code) throw new AuthError('exchange', 'no code in the callback');
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, client_id: o.clientId, code_verifier: p.verifier }, o.fetch, o.now);
}

export function refreshTokens(o: { clientId: string; refreshToken: string; fetch: typeof fetch; now: number }): Promise<TokenSet> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: o.refreshToken, client_id: o.clientId }, o.fetch, o.now, o.refreshToken);
}

export function loadTokens(s: KeyValueStore): TokenSet | null {
  try {
    const t = JSON.parse(s.get(TOKENS) ?? 'null');
    return t && typeof t.accessToken === 'string' && typeof t.refreshToken === 'string' && typeof t.expiresAt === 'number' ? t : null;
  } catch { return null; }
}
export const saveTokens = (s: KeyValueStore, t: TokenSet) => s.set(TOKENS, JSON.stringify(t));
export const clearTokens = (s: KeyValueStore) => s.remove(TOKENS);

/** localStorage/sessionStorage wrapped so a blocked or missing storage never throws. */
export function webStore(kind: 'local' | 'session'): KeyValueStore {
  const mem = new Map<string, string>();
  const area = () => { try { return kind === 'local' ? localStorage : sessionStorage; } catch { return null; } };
  return {
    get: k => { try { return area()?.getItem(k) ?? mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } },
    set: (k, v) => { mem.set(k, v); try { area()?.setItem(k, v); } catch { /* memory only */ } },
    remove: k => { mem.delete(k); try { area()?.removeItem(k); } catch { /* ignore */ } },
  };
}
