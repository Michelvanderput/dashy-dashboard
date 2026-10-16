import { createHash, timingSafeEqual } from 'node:crypto';

const sha = (s: string) => createHash('sha256').update(s).digest();
/** Constant-time comparison (both sides hashed first, so length does not leak). */
export const sameSecret = (given: string, expected: string) => timingSafeEqual(sha(given), sha(expected));

/** `Authorization: Bearer <token>`, or null. */
export function bearer(req: Request): string | null {
  const m = /^Bearer\s+(\S{8,300})$/i.exec(req.headers.get('authorization') ?? '');
  return m ? m[1] : null;
}
/**
 * The token of a request: the Bearer header, or (only when `allowPath`) the last path segment, for connectors that cannot send a header.
 * A secret in a URL ends up in logs and history, so prefer the header whenever the client can send one.
 */
export function tokenOf(req: Request, allowPath = false): string | null {
  const b = bearer(req);
  if (b) return b;
  if (!allowPath) return null;
  const seg = decodeURIComponent(new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '');
  return /^[A-Za-z0-9._~-]{16,200}$/.test(seg) ? seg : null;
}
export const authorized = (given: string | null, expected: string | undefined) => !!given && !!expected && expected.length >= 16 && sameSecret(given, expected);
