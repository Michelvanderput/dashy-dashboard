/**
 * Layer 1: Dashy reacts to your real tasks. Pure like driver.ts: no DOM, no timers, no Date.now().
 * Input is the dashboard the Dashy tools return: { today, tasks: [[id, title, category, when, note]], left_open, time_today }.
 * Output is driver events, so all the rules (done = small celebration, deadline near = strict, quiet hour = sad) stay in driver.ts.
 *
 * Tone on purpose: tasks that are already past their time are "still open", not late. They make him wait (a calm, open look),
 * never angry, and a deadline in the past is ignored by the driver (`TASK_DRIVER_CONFIG`).
 */
import type { DriverConfig, DriverEvent } from './driver';
import { splitNote } from './steps';
import { addDays, localParts } from './server/time';

export interface DashTask {
  id: string; title: string; category: string;
  /** ms since epoch, only when the task has a time of day */ due: number | null;
  /** the text as shown ("morgen 14:00") */ when: string; note: string; /** the first small step, or '' */ step: string;
  /** "now" = can be done now, "later" = planned for later (Straks). */ state: 'now' | 'later';
}
export interface DashboardSnapshot {
  today: string; tasks: DashTask[]; leftOpen: string[]; timeTodayMin: number;
  /** How many tasks were checked off today (Dutch day). */
  doneToday: number;
  /** The next appointment (epoch ms), or null. */
  appointment: { title: string; at: number; endsAt: number | null } | null;
  /** The working day, for the day bar. */
  workday: { start: string; end: string; days: number[] };
  /** Work time or free time (after the working day, days off): the screen turns warmer and work tasks wait. */
  mode: 'work' | 'free';
  /** How many work tasks wait until the next working day. */
  waiting: number;
  hours: Hours;
}
/** Hours of today, and what is still to be booked. */
export interface Hours { day: string; totalMin: number; unbookedMin: number; perProject: { project: string | null; minutes: number; unbookedMin: number }[]; olderUnbookedMin: number }
export const NO_HOURS: Hours = { day: '', totalMin: 0, unbookedMin: 0, perProject: [], olderUnbookedMin: 0 };
const DEFAULT_WORKDAY = { start: '08:30', end: '17:00', days: [1, 2, 3, 4, 5] };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const APPT_ID = '__appointment';

/** Strict (30 min before a deadline), never angry (-1: not even at the exact moment), nothing after the time has passed. */
export const TASK_DRIVER_CONFIG: Partial<DriverConfig> = { strictWithinMs: 30 * 60_000, angryWithinMs: -1, overdueGraceMs: 0, quietAfterMs: 2 * 60 * 60_000 };
/** In free time nothing is expected of you: a quiet evening must not make him sad. */
export const FREE_TIME_DRIVER_CONFIG: Partial<DriverConfig> = { ...TASK_DRIVER_CONFIG, quietAfterMs: Number.MAX_SAFE_INTEGER / 4 };

const DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/**
 * "vandaag 19:00", "morgen 14:00", "zo 10:00", "ma", "15 okt 19:00", "31 okt", "vandaag". Returns the due moment (local time) only when
 * the text has a time of day; a day without a time is not a deadline for the driver (it is shown, but does not make him strict).
 */
export function parseWhen(text: string, today: string): number | null {
  const t = text.trim().toLowerCase();
  const time = /(\d{1,2}):(\d{2})\s*$/.exec(t);
  if (!time) return null;
  const hh = +time[1], mm = +time[2];
  if (hh > 23 || mm > 59) return null;
  const head = t.slice(0, time.index).trim();
  const [y, mo, d] = today.split('-').map(Number);
  let day: Date | null = null;
  if (head === 'vandaag' || head === '') day = new Date(y, mo - 1, d);
  else if (head === 'morgen') day = new Date(y, mo - 1, d + 1);
  else if (DAYS.includes(head)) {
    const now = new Date(y, mo - 1, d), diff = ((DAYS.indexOf(head) - now.getDay() + 6) % 7) + 1; // next such day, 1..7 days ahead
    day = new Date(y, mo - 1, d + diff);
  } else {
    const dm = /^(\d{1,2})\s+([a-z]{3})$/.exec(head);
    const mi = dm ? MONTHS.indexOf(dm[2]) : -1;
    if (dm && mi >= 0) { day = new Date(y, mi, +dm[1]); if (mi < mo - 1 - 6) day = new Date(y + 1, mi, +dm[1]); }
  }
  if (!day || Number.isNaN(day.getTime())) return null;
  day.setHours(hh, mm, 0, 0);
  return day.getTime();
}

const p2 = (n: number) => String(n).padStart(2, '0');
/** "vandaag 19:00", "morgen", "zo 10:00", "22 okt 19:00" for a due moment (Dutch time). */
export function whenLabel(dueAt: number, hasTime: boolean, now: number): string {
  const d = localParts(dueAt), t = localParts(now);
  const day = (n: number) => { const x = addDays(t.y, t.mo, t.d, n); return `${x.y}-${p2(x.mo)}-${p2(x.d)}`; };
  const time = hasTime ? ` ${p2(d.h)}:${p2(d.mi)}` : '';
  if (d.date === day(0)) return `vandaag${time}`;
  if (d.date === day(1)) return `morgen${time}`;
  for (let n = 2; n <= 6; n++) if (d.date === day(n)) return `${DAYS[d.weekday]}${time}`;
  return `${d.d} ${MONTHS[d.mo - 1]}${time}`;
}

const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
/** "0m", "45m", "1u 20m" -> minutes. */
export function parseMinutes(s: unknown): number {
  if (typeof s !== 'string') return 0;
  const h = /(\d+)\s*u/.exec(s), m = /(\d+)\s*m/.exec(s);
  return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
}

/** Strict check of the dashboard body. Throws on anything unexpected; extra keys are ignored. */
export function parseDashboard(raw: unknown): DashboardSnapshot {
  const v: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (typeof v !== 'object' || v === null) throw new Error('not an object');
  const o = v as Record<string, unknown>;
  if (o.v === 2) return parseV2(o);
  const today = typeof o.today === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(o.today)?.[1] : undefined;
  if (!today) throw new Error('bad today');
  if (!Array.isArray(o.tasks) || o.tasks.length > 500) throw new Error('bad tasks');
  const tasks = o.tasks.map((r: unknown): DashTask => {
    if (!Array.isArray(r) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(r[0])) || !str(r[1], 200) || !str(r[2], 40) || !str(r[3] ?? '', 60)) throw new Error('bad task');
    return { id: r[0] as string, title: r[1] as string, category: r[2] as string, when: (r[3] as string) ?? '', due: parseWhen((r[3] as string) ?? '', today), ...splitNote(str(r[4], 400) ? (r[4] as string) : ''), state: 'now' };
  });
  const leftOpen = Array.isArray(o.left_open) ? o.left_open.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
  return { today, tasks, leftOpen, timeTodayMin: parseMinutes(o.time_today), doneToday: 0, appointment: null, workday: DEFAULT_WORKDAY, mode: 'work', waiting: 0, hours: NO_HOURS };
}

/** Version 2 (server/plan.ts StateBody): epoch times and an explicit hasTime, nothing to parse out of Dutch text. */
function parseV2(o: Record<string, unknown>): DashboardSnapshot {
  const today = typeof o.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.today) ? o.today : null;
  const nowMs = typeof o.now === 'number' && Number.isFinite(o.now) ? o.now : null;
  if (!today || nowMs === null) throw new Error('bad today');
  if (!Array.isArray(o.tasks) || o.tasks.length > 500) throw new Error('bad tasks');
  const tasks = o.tasks.map((r: unknown): DashTask => {
    const t = r as Record<string, unknown> | null;
    if (typeof t !== 'object' || t === null || !/^[A-Za-z0-9_-]{1,64}$/.test(String(t.id)) || !str(t.title, 200) || !str(t.category, 40)) throw new Error('bad task');
    const dueAt = typeof t.dueAt === 'number' && Number.isFinite(t.dueAt) ? t.dueAt : null, hasTime = t.hasTime === true;
    return { id: t.id as string, title: t.title as string, category: t.category as string, due: dueAt !== null && hasTime ? dueAt : null, when: dueAt === null ? '' : whenLabel(dueAt, hasTime, nowMs), ...splitNote(str(t.note, 400) ? (t.note as string) : ''), state: t.state === 'later' ? 'later' : 'now' };
  });
  const leftOpen = Array.isArray(o.leftOpen) ? o.leftOpen.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
  const a = o.appointment as Record<string, unknown> | null | undefined;
  const appointment = a && typeof a === 'object' && str(a.title, 200) && typeof a.at === 'number' && Number.isFinite(a.at)
    ? { title: a.title as string, at: a.at, endsAt: typeof a.endsAt === 'number' && Number.isFinite(a.endsAt) && a.endsAt > a.at ? a.endsAt : null } : null;
  const w = o.workday as Record<string, unknown> | undefined;
  const workday = w && typeof w.start === 'string' && HHMM.test(w.start) && typeof w.end === 'string' && HHMM.test(w.end) && w.end > w.start && Array.isArray(w.days) && w.days.every(d => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)
    ? { start: w.start, end: w.end, days: w.days as number[] } : DEFAULT_WORKDAY;
  const h = o.hours as Record<string, unknown> | undefined, nn = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
  const hours: Hours = h && typeof h === 'object' && Array.isArray(h.perProject)
    ? { day: typeof h.day === 'string' ? h.day : today, totalMin: nn(h.totalMin), unbookedMin: nn(h.unbookedMin), olderUnbookedMin: nn(h.olderUnbookedMin),
        perProject: h.perProject.slice(0, 20).filter((p): p is { project: string | null; minutes: number; unbookedMin: number } => typeof p === 'object' && p !== null && typeof (p as { minutes?: unknown }).minutes === 'number')
          .map(p => ({ project: typeof p.project === 'string' ? p.project.slice(0, 60) : null, minutes: nn(p.minutes), unbookedMin: nn(p.unbookedMin) })) }
    : NO_HOURS;
  const doneToday = Array.isArray(o.recentlyDone) ? o.recentlyDone.filter((d: unknown) => typeof d === 'object' && d !== null && typeof (d as { doneAt?: unknown }).doneAt === 'number' && localParts((d as { doneAt: number }).doneAt).date === today).length : 0;
  return { today, tasks, leftOpen, timeTodayMin: 0, doneToday, appointment, workday, mode: o.mode === 'free' ? 'free' : 'work', waiting: nn(o.waiting), hours };
}

/** What changed between two snapshots, as driver events. `prev` null = first look. */
export function snapshotEvents(prev: DashboardSnapshot | null, next: DashboardSnapshot): DriverEvent[] {
  const ev: DriverEvent[] = [];
  const before = new Map((prev?.tasks ?? []).map(t => [t.id, t])), after = new Map(next.tasks.map(t => [t.id, t]));
  for (const t of next.tasks) {
    const old = before.get(t.id);
    if (!old) ev.push({ type: 'taskAdded', id: t.id, dueAt: t.due });
    else if (old.due !== t.due) ev.push({ type: 'taskDueChanged', id: t.id, dueAt: t.due });
  }
  for (const id of before.keys()) if (!after.has(id)) ev.push({ type: 'taskDone', id });
  const stillOpen = next.leftOpen.length > 0;
  if (stillOpen !== ((prev?.leftOpen.length ?? 0) > 0)) ev.push({ type: 'waiting', value: stillOpen });
  // an appointment counts like a task with a time: strict shortly before it, calm again after
  const pa = prev?.appointment ?? null, na = next.appointment;
  if (na && !pa) ev.push({ type: 'taskAdded', id: APPT_ID, dueAt: na.at });
  else if (na && pa && pa.at !== na.at) ev.push({ type: 'taskDueChanged', id: APPT_ID, dueAt: na.at });
  else if (!na && pa) ev.push({ type: 'taskRemoved', id: APPT_ID });
  if (prev && next.timeTodayMin > prev.timeTodayMin) ev.push({ type: 'activity' });
  return ev;
}

/** The task to do now: the first one that can be done now (tasks planned for later are "Straks", not "Nu"). */
export const nowTask = (s: DashboardSnapshot | null): DashTask | null => s?.tasks.find(t => t.state === 'now') ?? null;
