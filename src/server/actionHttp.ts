import { authorized, fingerprint, tokenFrom } from './auth';
import { update, type Store } from './dashyStore';
import { buildStateBody, reply } from './stateHttp';

export interface ActionHttpDeps {
  store: Store | null;
  now: () => number;
  /** Lets the screen check a task off or undo it, nothing else. Different from the MCP token (Claude) and the read-only token. */
  actionToken: string | undefined;
  allow: (key: string) => Promise<boolean>;
  log?: (msg: string) => void;
}

const MAX_BODY = 1000;
const calm = (at: number) => ({ state: 'idle', line: '', source: 'fallback' as const, rule: 'idle', nextWakeAt: null, rev: 0, at, items: [], focusId: null });

/** POST {action: 'done' | 'undo', id}. Answers with the fresh state body; every error answers with the calm shape. */
export async function handleActionRequest(req: Request, deps: ActionHttpDeps): Promise<Response> {
  const log = deps.log ?? console.error;
  const now = deps.now();
  if (req.method !== 'POST') return reply(405, calm(now), 'method');
  if (!deps.actionToken || !deps.store) { log('action endpoint not configured: DASHY_ACTION_TOKEN or Redis missing'); return reply(503, calm(now), 'not-configured'); }
  if (!authorized(req, deps.actionToken)) return reply(401, calm(now), 'unauthorized');
  let allowed = false;
  try { allowed = await deps.allow(`action:${fingerprint(tokenFrom(req))}`); } catch (e) { log(`rate limiter failed: ${String(e)}`); }
  if (!allowed) return reply(429, calm(now), 'rate-limited');
  let body: { action?: unknown; id?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return reply(413, calm(now), 'too-large');
    body = JSON.parse(text);
  } catch { return reply(400, calm(now), 'bad-body'); }
  if (typeof body !== 'object' || body === null || (body.action !== 'done' && body.action !== 'undo') || typeof body.id !== 'string') return reply(400, calm(now), 'bad-body');
  try {
    const { outcome, doc } = await update(deps.store, now, { tool: 'task', action: body.action === 'done' ? 'done' : 'reopen', id: body.id });
    if (!outcome.ok) return reply(409, buildStateBody(doc, now), 'rejected');
    return reply(200, buildStateBody(doc, now));
  } catch (e) {
    log(`action failed: ${String(e)}`);
    return reply(503, calm(now), 'unavailable');
  }
}
