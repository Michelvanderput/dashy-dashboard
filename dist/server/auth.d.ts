/** Constant-time comparison (both sides hashed first, so length does not leak). */
export declare const sameSecret: (given: string, expected: string) => boolean;
/** `Authorization: Bearer <token>`, or null. */
export declare function bearer(req: Request): string | null;
/**
 * The token of a request: the Bearer header, or (only when `allowPath`) the last path segment, for connectors that cannot send a header.
 * A secret in a URL ends up in logs and history, so prefer the header whenever the client can send one.
 */
export declare function tokenOf(req: Request, allowPath?: boolean): string | null;
export declare const authorized: (given: string | null, expected: string | undefined) => boolean;
