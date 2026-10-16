/**
 * CORS for the desktop shells. The web app calls its own site (same origin, no CORS needed). A desktop app (Tauri) runs on
 * its own origin and calls the site's API, so those exact origins are allowed, nothing else. Tokens travel in a header,
 * never in cookies, so allowing an origin does not let a page act on someone's behalf without the token.
 */
export declare const DEFAULT_ORIGINS: readonly string[];
/** Origins from a comma separated env value, added to the defaults. Anything that is not a plain origin is dropped. */
export declare function originsFrom(extra: string | undefined): string[];
/** Adds the CORS headers when the caller's Origin is allowed. */
export declare function withCors(req: Request, allowed: readonly string[], res: Response): Response;
/** The answer to an OPTIONS preflight: 204 for an allowed origin, 403 otherwise. */
export declare function preflight(req: Request, allowed: readonly string[], methods: string): Response;
