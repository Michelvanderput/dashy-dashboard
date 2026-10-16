/**
 * Pairing code: link a new screen without pasting a long URL with keys. Claude (tool `pairing_code`) gives a short code like "K7M2-9QXA";
 * the new screen sends it to /api/pair and gets the screen keys back. Nothing is stored: the code is an HMAC of the current ten-minute
 * window, so it works for 10 to 20 minutes and then it is gone by itself. It only ever hands out the read and the "done" keys, never the MCP key.
 */
import { createHmac } from 'node:crypto';
import { sameSecret } from './auth.js';

export const PAIR_WINDOW_MS = 10 * 60_000;
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0, 1, I, L, O: nothing to mix up when reading it off a screen
const window = (now: number) => Math.floor(now / PAIR_WINDOW_MS);

export function pairCode(secret: string, now: number, back = 0): string {
  const mac = createHmac('sha256', secret).update(`dashy-pair:${window(now) - back}`).digest();
  const raw = Array.from(mac.subarray(0, 8), b => ALPHABET[b % ALPHABET.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
export function validPairCode(secret: string, given: string, now: number): boolean {
  const g = normalizeCode(given);
  if (g.length !== 8) return false;
  return [0, 1].map(back => sameSecret(g, normalizeCode(pairCode(secret, now, back)))).some(Boolean);
}
/** For the tool: the code, and how long it is good for at least. */
export const currentPairing = (secret: string, now: number) => ({ code: pairCode(secret, now), minutesValid: Math.max(1, Math.ceil((PAIR_WINDOW_MS - (now % PAIR_WINDOW_MS)) / 60_000)) });

export interface PairDeps { secret: string | undefined; stateToken: string | undefined; actionToken: string | undefined; now: () => number }
const json = (body: unknown, status: number, cors: Record<string, string>) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });

/** POST { "code": "K7M2-9QXA" } gives { url, key, act }. The url is this same server. */
export async function handlePair(req: Request, d: PairDeps): Promise<Response> {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405, { ...cors, allow: 'POST' });
  if (!d.secret || d.secret.length < 16 || !d.stateToken) return json({ error: 'not-configured' }, 503, cors);
  const text = await req.text();
  if (text.length > 256) return json({ error: 'too-large' }, 413, cors);
  let b: { code?: unknown };
  try { b = JSON.parse(text); } catch { return json({ error: 'bad-json' }, 400, cors); }
  if (typeof b.code !== 'string' || !validPairCode(d.secret!, b.code, d.now())) return json({ error: 'wrong-code' }, 401, cors);
  return json({ url: new URL('/api/state', req.url).toString(), key: d.stateToken, act: d.actionToken ?? null }, 200, cors);
}
