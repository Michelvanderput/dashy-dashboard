import type { DashyState } from './core';
import { HABIT_LIMITS, type Habit } from './dashboard/habits';
import type { PlanItem } from './dashboard/plan';

export interface RemoteState { state: DashyState; line: string; source: 'driver' | 'claude' | 'fallback'; nextWakeAt: number | null; rev: number; /** which driver rule decided, when the server says */ rule?: string; /** the plan (titles), when the server keeps it */ items: PlanItem[]; focusId: string | null; habits: Habit[]; flags: Flags; /** minutes of focus today */ focusedMinutes: number }
export interface Flags { break: boolean; blocked: boolean; waiting: boolean }
export interface StateClientOptions { url: string; token: string; timeoutMs?: number; fetch?: typeof fetch }

const STATES: readonly string[] = ['idle', 'received', 'working', 'thinking', 'waiting', 'blocked', 'done', 'happy', 'sad', 'angry', 'strict', 'dancing', 'sleepy'];
export const CALM: RemoteState = Object.freeze({ state: 'idle', line: '', source: 'fallback', nextWakeAt: null, rev: 0, items: [], focusId: null, habits: [], flags: { break: false, blocked: false, waiting: false }, focusedMinutes: 0 }) as RemoteState;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
function parseItem(x: unknown): PlanItem {
  if (typeof x !== 'object' || x === null) throw new Error('bad item');
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || !ID.test(o.id)) throw new Error('bad item id');
  if (o.kind !== 'task' && o.kind !== 'event') throw new Error('bad item kind');
  if (typeof o.title !== 'string' || o.title.length === 0 || o.title.length > 120) throw new Error('bad item title');
  if (o.at !== null && !num(o.at)) throw new Error('bad item time');
  const item: PlanItem = { id: o.id, kind: o.kind, title: o.title, at: o.at as number | null };
  if (o.endsAt !== undefined && o.endsAt !== null) { if (!num(o.endsAt)) throw new Error('bad item end'); item.endsAt = o.endsAt; }
  if (o.done !== undefined) { if (typeof o.done !== 'boolean') throw new Error('bad item done'); item.done = o.done; }
  if (o.doneAt !== undefined) { if (!num(o.doneAt)) throw new Error('bad item doneAt'); item.doneAt = o.doneAt; }
  if (o.note !== undefined) { if (typeof o.note !== 'string' || o.note.length > 200) throw new Error('bad item note'); item.note = o.note; }
  return item;
}

function parseHabit(x: unknown): Habit {
  if (typeof x !== 'object' || x === null) throw new Error('bad habit');
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || !ID.test(o.id)) throw new Error('bad habit id');
  if (typeof o.title !== 'string' || !o.title || o.title.length > HABIT_LIMITS.title) throw new Error('bad habit title');
  if (!Number.isInteger(o.perWeek) || (o.perWeek as number) < 1 || (o.perWeek as number) > 7) throw new Error('bad habit target');
  if (!Array.isArray(o.done) || o.done.length > 40 || !o.done.every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error('bad habit days');
  if (o.plan !== undefined && (typeof o.plan !== 'string' || o.plan.length > HABIT_LIMITS.plan)) throw new Error('bad habit plan');
  return { id: o.id, title: o.title, perWeek: o.perWeek as number, done: o.done as string[], ...(o.plan !== undefined ? { plan: o.plan as string } : {}) };
}

/** Strict check of the state body; throws on anything unexpected. Unknown extra keys are ignored (the server may add some). */
export function parseRemoteState(raw: unknown): RemoteState {
  const v: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (typeof v !== 'object' || v === null) throw new Error('not an object');
  const o = v as Record<string, unknown>;
  if (typeof o.state !== 'string' || !STATES.includes(o.state)) throw new Error('bad state');
  if (typeof o.line !== 'string' || o.line.length > 100) throw new Error('bad line');
  if (o.source !== 'driver' && o.source !== 'claude' && o.source !== 'fallback') throw new Error('bad source');
  const wake = o.nextWakeAt;
  if (wake !== null && (typeof wake !== 'number' || !Number.isFinite(wake))) throw new Error('bad wake');
  if (o.items !== undefined && (!Array.isArray(o.items) || o.items.length > 400)) throw new Error('bad items');
  const items = ((o.items as unknown[] | undefined) ?? []).map(parseItem);
  if (o.focusId !== undefined && o.focusId !== null && (typeof o.focusId !== 'string' || !ID.test(o.focusId))) throw new Error('bad focusId');
  if (o.habits !== undefined && (!Array.isArray(o.habits) || o.habits.length > HABIT_LIMITS.count)) throw new Error('bad habits');
  const habits = ((o.habits as unknown[] | undefined) ?? []).map(parseHabit);
  let flags: Flags = { break: false, blocked: false, waiting: false };
  if (o.flags !== undefined) {
    const f = o.flags as Record<string, unknown> | null;
    if (typeof f !== 'object' || f === null || typeof f.break !== 'boolean' || typeof f.blocked !== 'boolean' || typeof f.waiting !== 'boolean') throw new Error('bad flags');
    flags = { break: f.break, blocked: f.blocked, waiting: f.waiting };
  }
  if (o.focusedMinutes !== undefined && (!Number.isInteger(o.focusedMinutes) || (o.focusedMinutes as number) < 0 || (o.focusedMinutes as number) > 1440)) throw new Error('bad focusedMinutes');
  return { flags, focusedMinutes: (o.focusedMinutes as number | undefined) ?? 0, habits, items, focusId: (o.focusId as string | null | undefined) ?? null, state: o.state as DashyState, line: o.line, source: o.source, nextWakeAt: wake as number | null, rev: typeof o.rev === 'number' ? o.rev : 0, ...(typeof o.rule === 'string' && o.rule.length < 30 ? { rule: o.rule } : {}) };
}

/** Never throws, never hangs: any error, timeout, bad status or invalid body gives the calm fallback (idle, no text). */
export async function fetchDashyState(o: StateClientOptions): Promise<RemoteState> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { ctl.abort(); reject(new Error('timeout')); }, o.timeoutMs ?? 8000); });
  try {
    const request = (async () => {
      const res = await (o.fetch ?? fetch)(o.url, { method: 'GET', headers: { authorization: `Bearer ${o.token}` }, signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return parseRemoteState(await res.text());
    })();
    request.catch(() => {});
    return await Promise.race([request, timeout]);
  } catch { return { ...CALM }; } finally { clearTimeout(timer); }
}

export type ActionKind = 'done' | 'undo' | 'add' | 'focus' | 'check' | 'uncheck' | 'later' | 'focused' | 'flag';
/** Check off (or undo) a task. Resolves to the fresh state, or null when it did not work (the screen then just keeps what it has). */
export async function sendAction(o: { url: string; token: string; action: ActionKind; id?: string | null; title?: string; until?: 'plus30' | 'tomorrow'; minutes?: number; flag?: 'break' | 'blocked' | 'waiting'; value?: boolean; timeoutMs?: number; fetch?: typeof fetch }): Promise<RemoteState | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 8000);
  try {
    const res = await (o.fetch ?? fetch)(o.url, { method: 'POST', headers: { authorization: `Bearer ${o.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: o.action, ...(o.id !== undefined ? { id: o.id } : {}), ...(o.title !== undefined ? { title: o.title } : {}), ...(o.until ? { until: o.until } : {}), ...(o.minutes !== undefined ? { minutes: o.minutes } : {}), ...(o.flag ? { flag: o.flag, value: o.value } : {}) }), signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return parseRemoteState(await res.text());
  } catch { return null; } finally { clearTimeout(timer); }
}
