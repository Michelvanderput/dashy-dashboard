/** Constant-time comparison of two secrets (hashes first, so the length does not leak). */
export declare function sameSecret(given: string, expected: string): boolean;
/**
 * Token from `Authorization: Bearer <token>` or from `?key=<token>`.
 * The query form exists because some connector UIs cannot send a custom header; URLs end up in logs, so prefer the header.
 */
export declare function tokenFrom(req: Request): string;
/** false when no secret is configured (an empty secret never matches anything). */
export declare function authorized(req: Request, secret: string | undefined): boolean;
/** Short stable id of a token, for rate-limit keys (never store the token itself, not even a piece of it). */
export declare function fingerprint(token: string): string;
