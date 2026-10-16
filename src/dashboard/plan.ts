/** Planning data and the small helpers around it. Pure. */
import { initialDriverState, reduce, type DriverState } from '../driver';

export interface PlanItem { id: string; kind: 'task' | 'event'; title: string; /** start (event) or deadline (task), ms epoch */ at: number | null; endsAt?: number | null; done?: boolean; note?: string }
export type Urgency = 'near' | 'soon' | 'normal';

export const URGENT = { nearMs: 15 * 60_000, soonMs: 60 * 60_000 } as const;

export function urgency(item: PlanItem, now: number): Urgency {
  if (item.kind !== 'task' || item.done || item.at === null) return 'normal';
  const left = item.at - now;
  return left <= URGENT.nearMs ? 'near' : left <= URGENT.soonMs ? 'soon' : 'normal';
}

/** Open items by time (items without a time last), finished tasks at the bottom. Does not mutate. */
export function planOrder(items: readonly PlanItem[], now: number): PlanItem[] {
  const key = (i: PlanItem) => (i.done ? 2 : i.at === null ? 1 : 0);
  return [...items].filter(i => i.kind === 'task' || (i.endsAt ?? i.at ?? 0) >= now - 30 * 60_000 || i.done)
    .sort((a, b) => key(a) - key(b) || (a.at ?? Infinity) - (b.at ?? Infinity) || a.title.localeCompare(b.title));
}

/** The next thing that happens: the earliest open appointment or task deadline that has not passed by more than 2 minutes. */
export function nextUp(items: readonly PlanItem[], now: number): { item: PlanItem; at: number } | null {
  let best: { item: PlanItem; at: number } | null = null;
  for (const item of items) {
    if (item.done || item.at === null || item.at < now - 2 * 60_000) continue;
    if (!best || item.at < best.at) best = { item, at: item.at };
  }
  return best;
}
export const nextAppointmentAt = (items: readonly PlanItem[], now: number): number | null => {
  let best: number | null = null;
  for (const i of items) if (i.kind === 'event' && !i.done && i.at !== null && i.at >= now - 2 * 60_000 && (best === null || i.at < best)) best = i.at;
  return best;
};

/** "nu", "8 min", "1 u 05", "3 u". Past times: "nu" for the first minutes, then "5 min geleden". */
export function countdown(ms: number): string {
  if (ms < 0 && ms > -60_000) return 'nu'; // it just started
  const m = Math.round(Math.abs(ms) / 60_000);
  const text = m < 1 ? 'nu' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} u${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
  return ms < -60_000 && m >= 1 ? `${text} geleden` : text;
}
export const clock = (ms: number, tz?: string) => new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(ms);

// ---------- model: the list and the state driver move together ----------
export interface Model { items: PlanItem[]; driver: DriverState; musicSince: number | null }
export type Action =
  | { type: 'add'; item: PlanItem }
  | { type: 'done'; id: string }
  | { type: 'undo'; id: string }
  | { type: 'flag'; flag: 'waiting' | 'blocked' | 'break' | 'working'; value: boolean }
  | { type: 'music'; playing: boolean }
  | { type: 'reset'; items: PlanItem[] };

export function initialModel(items: PlanItem[], now: number): Model {
  let driver = initialDriverState(now);
  for (const i of items) if (i.kind === 'task' && !i.done) driver = { ...driver, tasks: { ...driver.tasks, [i.id]: i.at } };
  return { items, driver, musicSince: null };
}

export function reducer(m: Model, a: Action, now: number): Model {
  switch (a.type) {
    case 'add': {
      if (m.items.some(i => i.id === a.item.id)) return m;
      const driver = a.item.kind === 'task' ? reduce(m.driver, { type: 'taskAdded', id: a.item.id, dueAt: a.item.at }, now) : reduce(m.driver, { type: 'activity' }, now);
      return { ...m, items: [...m.items, a.item], driver };
    }
    case 'done': {
      const it = m.items.find(i => i.id === a.id);
      if (!it || it.done) return m;
      return { ...m, items: m.items.map(i => (i.id === a.id ? { ...i, done: true } : i)), driver: reduce(m.driver, { type: 'taskDone', id: a.id }, now) };
    }
    case 'undo': {
      const it = m.items.find(i => i.id === a.id);
      if (!it || !it.done) return m;
      // reopening a task puts its deadline back with the driver
      return { ...m, items: m.items.map(i => (i.id === a.id ? { ...i, done: false } : i)), driver: { ...m.driver, tasks: { ...m.driver.tasks, [a.id]: it.at }, lastActivityAt: now } };
    }
    case 'flag': return { ...m, driver: reduce(m.driver, { type: a.flag, value: a.value } as never, now) };
    case 'music': return a.playing === (m.musicSince !== null) ? m : { ...m, musicSince: a.playing ? now : null, driver: a.playing ? reduce(m.driver, { type: 'activity' }, now) : m.driver };
    case 'reset': return initialModel(a.items, now);
  }
}
