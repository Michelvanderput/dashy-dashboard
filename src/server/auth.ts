import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time comparison of two secrets (hashes first, so the length does not leak). */
export function sameSecret(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Token from `Authorization: Bearer <token>` or from `?key=<token>`.
 * The query form exists because some connector UIs cannot send a custom header; URLs end up in logs, so prefer the header.
 */
export function tokenFrom(req: Request): string {
  const h = req.headers.get('authorization') ?? '';
  if (/^Bearer /i.test(h)) return h.slice(7).trim();
  try { return new URL(req.url).searchParams.get('key') ?? ''; } catch { return ''; }
}

/** false when no secret is configured (an empty secret never matches anything). */
export function authorized(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = tokenFrom(req);
  return given.length > 0 && sameSecret(given, secret);
}

/** Short stable id of a token, for rate-limit keys (never store the token itself, not even a piece of it). */
export function fingerprint(token: string): string { return digest(token).toString('hex').slice(0, 12); }
