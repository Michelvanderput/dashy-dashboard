import { authorized, fingerprint, tokenFrom } from './auth';
import type { Habit } from '../dashboard/habits';
import type { PlanItem } from '../dashboard/plan';
import { focusToday, planOf, read, view, type Doc, type Store } from './dashyStore';

export interface StateHttpDeps {
  store: Store | null;
  now: () => number;
  /** Read-only secret for the app. It cannot call the MCP. */
  stateToken: string | undefined;
  allow: (key: string) => Promise<boolean>;
  log?: (msg: string) => void;
}

export interface StateBody { state: string; line: string; source: 'driver' | 'claude' | 'fallback'; rule: string; nextWakeAt: number | null; rev: number; at: number; items: PlanItem[]; focusId: string | null; habits: Habit[]; flags: { break: boolean; blocked: boolean; waiting: boolean }; focusedMinutes: number }
const calm = (at: number): StateBody => ({ state: 'idle', line: '', source: 'fallback', rule: 'idle', nextWakeAt: null, rev: 0, at, items: [], focusId: null, habits: [], flags: { break: false, blocked: false, waiting: false }, focusedMinutes: 0 });
/** What the screen needs from the document: the state to show, and the plan. */
export function buildStateBody(doc: Doc, now: number): StateBody {
  const v = view(doc, now);
  return { state: v.state, line: v.line, source: v.source, rule: v.rule, nextWakeAt: v.nextWakeAt, rev: v.rev, at: now, items: planOf(doc), focusId: doc.focusId, habits: Object.values(doc.habits), flags: { break: doc.driver.onBreak, blocked: doc.driver.blocked, waiting: doc.driver.waiting }, focusedMinutes: focusToday(doc, now) };
}
export const reply = (status: number, b: StateBody, reason?: string) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(reason ? { 'x-dashy-reason': reason } : {}) } });

/** What the app polls: the state Dashy should show right now. Every answer, also an error, is a valid state body. */
export async function handleStateRequest(req: Request, deps: StateHttpDeps): Promise<Response> {
  const log = deps.log ?? console.error;
  const now = deps.now();
  if (req.method !== 'GET') return reply(405, calm(now), 'method');
  if (!deps.stateToken || !deps.store) { log('state endpoint not configured: DASHY_STATE_TOKEN or Redis missing'); return reply(503, calm(now), 'not-configured'); }
  if (!authorized(req, deps.stateToken)) return reply(401, calm(now), 'unauthorized');
  let allowed = false;
  try { allowed = await deps.allow(`state:${fingerprint(tokenFrom(req))}`); } catch (e) { log(`rate limiter failed: ${String(e)}`); }
  if (!allowed) return reply(429, calm(now), 'rate-limited');
  try {
    return reply(200, buildStateBody(await read(deps.store, now), now));
  } catch (e) {
    log(`state read failed: ${String(e)}`);
    return reply(200, calm(now), 'fallback');
  }
}
