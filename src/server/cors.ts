/**
 * CORS for the desktop shells. The web app calls its own site (same origin, no CORS needed). A desktop app (Tauri) runs on
 * its own origin and calls the site's API, so those exact origins are allowed, nothing else. Tokens travel in a header,
 * never in cookies, so allowing an origin does not let a page act on someone's behalf without the token.
 */
export const DEFAULT_ORIGINS: readonly string[] = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];

/** Origins from a comma separated env value, added to the defaults. Anything that is not a plain origin is dropped. */
export function originsFrom(extra: string | undefined): string[] {
  const more = (extra ?? '').split(',').map(s => s.trim()).filter(s => /^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(s));
  return [...new Set([...DEFAULT_ORIGINS, ...more])];
}

/** Adds the CORS headers when the caller's Origin is allowed. */
export function withCors(req: Request, allowed: readonly string[], res: Response): Response {
  const origin = req.headers.get('origin');
  if (!origin || !allowed.includes(origin)) return res;
  const headers = new Headers(res.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('vary', 'Origin');
  headers.set('access-control-expose-headers', 'x-dashy-reason');
  return new Response(res.body, { status: res.status, headers });
}

/** The answer to an OPTIONS preflight: 204 for an allowed origin, 403 otherwise. */
export function preflight(req: Request, allowed: readonly string[], methods: string): Response {
  const origin = req.headers.get('origin');
  if (!origin || !allowed.includes(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: {
    'access-control-allow-origin': origin, 'vary': 'Origin', 'access-control-allow-methods': `${methods}, OPTIONS`,
    'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600',
  } });
}
