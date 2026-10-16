import { SAFE_FALLBACK, getAdvice, sanitizeInput, type Advice, type AdviceInput } from '../advice';

export interface AdviceDeps {
  /** Calls the model. Returns the raw answer (object or JSON text). Injected so it can be faked in tests. */
  generate: (system: string, user: string) => Promise<unknown>;
  /** Returns true when this caller may make a call. */
  allow: (key: string) => Promise<boolean>;
  /** Shared secret the app must send as a bearer token. */
  token: string | undefined;
}

const MAX_BODY = 20_000;
const json = (status: number, body: Advice | { state: 'idle'; line: '' }, reason?: string) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(reason ? { 'x-dashy-reason': reason } : {}) } });
const fallback = (status: number, reason: string) => json(status, { ...SAFE_FALLBACK }, reason);

/**
 * POST { now, tasks, agenda } -> { state, line }. Every response, also errors, has exactly that shape, so the
 * app can always parse it. Error details go to the server log only, never into the response.
 */
export async function handleAdviceRequest(req: Request, deps: AdviceDeps, log: (msg: string) => void = console.error): Promise<Response> {
  if (req.method !== 'POST') return fallback(405, 'method');
  if (!deps.token) { log('DASHY_API_TOKEN is not set'); return fallback(503, 'not-configured'); }
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${deps.token}`) return fallback(401, 'unauthorized');

  const text = await req.text();
  if (text.length > MAX_BODY) return fallback(413, 'too-large');
  let input: AdviceInput;
  try {
    const b = JSON.parse(text);
    if (typeof b !== 'object' || b === null || typeof b.now !== 'string' || !Array.isArray(b.tasks) || !Array.isArray(b.agenda)) throw new Error('shape');
    input = sanitizeInput(b);
  } catch { return fallback(400, 'bad-request'); }

  const key = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  let allowed = false;
  try { allowed = await deps.allow(key); } catch (e) { log(`rate limiter failed: ${String(e)}`); }
  if (!allowed) return fallback(429, 'rate-limited');

  let failure: unknown;
  const advice = await getAdvice(input, async (s, u) => { try { return await deps.generate(s, u); } catch (e) { failure = e; throw e; } });
  if (failure) log(`model call failed: ${String(failure)}`);
  return json(200, advice, advice === undefined || advice.line === '' ? 'fallback' : undefined);
}
