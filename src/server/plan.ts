/** What is "now", what is "later", what is still open from before. Pure: pass the time in. */
import { localParts, startOfDay, TIME_ZONE } from './time.js';
import type { Task } from './model.js';

/** A task with a time becomes "Nu doen" this long before it; a date-only task at DATE_ONLY_READY_HOUR that morning. */
export const READY_LEAD_MS = 60 * 60_000;
export const DATE_ONLY_READY_HOUR = 7;

/** When the task becomes ready for "Nu doen"; null = always. */
export function readyAt(t: Pick<Task, 'dueAt' | 'hasTime'>): number | null {
  if (t.dueAt === null) return null;
  return t.hasTime ? t.dueAt - READY_LEAD_MS : t.dueAt + DATE_ONLY_READY_HOUR * 3600_000; // dueAt of a date-only task is local midnight
}
export const isReady = (t: Pick<Task, 'dueAt' | 'hasTime'>, now: number) => { const r = readyAt(t); return r === null || r <= now; };

export interface Ordered { ready: Task[]; planned: Task[]; }
/** Open tasks in the order the screen shows them: what can be done now first (a real time of day goes first, by time), then what is planned. */
export function orderTasks(open: Task[], now: number): Ordered {
  const byPos = (a: Task, b: Task) => a.position - b.position || a.createdAt - b.createdAt;
  const ready = open.filter(t => isReady(t, now)), planned = open.filter(t => !isReady(t, now));
  const timed = ready.filter(t => t.dueAt !== null && t.hasTime).sort((a, b) => a.dueAt! - b.dueAt!);
  const rest = ready.filter(t => !(t.dueAt !== null && t.hasTime)).sort(byPos);
  return { ready: [...timed, ...rest], planned: planned.sort((a, b) => (readyAt(a)! - readyAt(b)!) || byPos(a, b)) };
}

/** Open tasks whose day is before today. Facts, no verdict. */
export function leftOpen(open: Task[], now: number, tz = TIME_ZONE): Task[] {
  const t0 = startOfDay(now, tz);
  return open.filter(t => t.dueAt !== null && t.dueAt < t0);
}

export interface Appointment { title: string; at: number; endsAt?: number | null }
/** Version 2 of the state body: what the screen and Claude both read. Epoch times, no Dutch text to parse. */
export interface StateBody {
  v: 2; today: string; weekday: number; now: number; tz: string;
  tasks: { id: string; title: string; category: string; dueAt: number | null; hasTime: boolean; note: string | null; state: 'now' | 'later' }[];
  leftOpen: string[];
  /** Done in the last 24 h, newest first, so the screen can celebrate by itself. */
  recentlyDone: { id: string; title: string; doneAt: number }[];
  appointment: Appointment | null;
}
export function buildState(all: Task[], appointment: Appointment | null, now: number, tz = TIME_ZONE): StateBody {
  const open = all.filter(t => !t.done);
  const { ready, planned } = orderTasks(open, now);
  const p = localParts(now, tz);
  const view = (t: Task, state: 'now' | 'later') => ({ id: t.id, title: t.title, category: t.category, dueAt: t.dueAt, hasTime: t.hasTime, note: t.note, state });
  return {
    v: 2, today: p.date, weekday: p.weekday, now, tz,
    tasks: [...ready.map(t => view(t, 'now')), ...planned.map(t => view(t, 'later'))],
    leftOpen: leftOpen(open, now, tz).map(t => t.id),
    recentlyDone: all.filter(t => t.done && t.doneAt !== null && now - t.doneAt < 24 * 3600_000).sort((a, b) => b.doneAt! - a.doneAt!).slice(0, 20).map(t => ({ id: t.id, title: t.title, doneAt: t.doneAt! })),
    appointment: appointment && (appointment.endsAt ?? appointment.at) > now ? appointment : null,
  };
}
