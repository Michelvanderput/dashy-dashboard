import { authorized, fingerprint, tokenFrom } from './auth';
import { update, type Call, type Store } from './dashyStore';
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
const calm = (at: number) => ({ state: 'idle', line: '', source: 'fallback' as const, rule: 'idle', nextWakeAt: null, rev: 0, at, items: [], focusId: null, habits: [] });

/** What the screen may do, and nothing more: check a task off or back, add a task (title only), choose the task to do first, check a habit today. */
function toCall(b: { action?: unknown; id?: unknown; title?: unknown } | null, now: number): Call | null {
  if (typeof b !== 'object' || b === null) return null;
  const id = typeof b.id === 'string' ? b.id : null;
  switch (b.action) {
    case 'done': return id ? { tool: 'task', action: 'done', id } : null;
    case 'undo': return id ? { tool: 'task', action: 'reopen', id } : null;
    case 'check': case 'uncheck': return id ? { tool: 'habit', action: b.action, id } : null;
    case 'focus': return id !== null || b.id === null ? { tool: 'focus', id } : null;
    case 'add': {
      if (typeof b.title !== 'string' || !b.title.trim()) return null;
      return { tool: 'task', action: 'added', id: `s${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: b.title, due: null };
    }
    default: return null;
  }
}

/** POST {action: 'done' | 'undo' | 'add' | 'focus' | 'check' | 'uncheck', id?, title?}. Answers with the fresh state body; every error answers with the calm shape. */
export async function handleActionRequest(req: Request, deps: ActionHttpDeps): Promise<Response> {
  const log = deps.log ?? console.error;
  const now = deps.now();
  if (req.method !== 'POST') return reply(405, calm(now), 'method');
  if (!deps.actionToken || !deps.store) { log('action endpoint not configured: DASHY_ACTION_TOKEN or Redis missing'); return reply(503, calm(now), 'not-configured'); }
  if (!authorized(req, deps.actionToken)) return reply(401, calm(now), 'unauthorized');
  let allowed = false;
  try { allowed = await deps.allow(`action:${fingerprint(tokenFrom(req))}`); } catch (e) { log(`rate limiter failed: ${String(e)}`); }
  if (!allowed) return reply(429, calm(now), 'rate-limited');
  let body: { action?: unknown; id?: unknown; title?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return reply(413, calm(now), 'too-large');
    body = JSON.parse(text);
  } catch { return reply(400, calm(now), 'bad-body'); }
  const call = toCall(body, now);
  if (!call) return reply(400, calm(now), 'bad-body');
  try {
    const { outcome, doc } = await update(deps.store, now, call);
    if (!outcome.ok) return reply(409, buildStateBody(doc, now), 'rejected');
    return reply(200, buildStateBody(doc, now));
  } catch (e) {
    log(`action failed: ${String(e)}`);
    return reply(503, calm(now), 'unavailable');
  }
}
