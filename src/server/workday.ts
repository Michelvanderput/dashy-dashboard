/** The working day: when it starts and ends, and where "now" is in it. Pure: pass the time in. Dutch wall-clock (see time.ts). */
import { localParts, startOfDay, zonedToEpoch, TIME_ZONE } from './time.js';

/** Start and end as HH:MM and the weekdays it applies to (0 = Sunday). */
export interface WorkdayConfig { start: string; end: string; days: number[] }
export const DEFAULT_WORKDAY: WorkdayConfig = { start: '08:30', end: '17:00', days: [1, 2, 3, 4, 5] };
export type Workday = WorkdayConfig;

/** "08:30-17:00". Anything invalid gives the default, never a crash. */
export function parseWorkday(text: string | undefined): WorkdayConfig {
  const m = /^\s*([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)\s*$/.exec(text ?? '');
  if (!m) return DEFAULT_WORKDAY;
  const [a, b] = [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]];
  if (b <= a) return DEFAULT_WORKDAY;
  const hh = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return { start: hh(a), end: hh(b), days: DEFAULT_WORKDAY.days };
}

const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export type DayPhase = 'free' | 'before' | 'during' | 'after';
export interface DayProgress { phase: DayPhase; /** 0..1 through the working day (0 before, 1 after) */ fraction: number; leftMs: number; start: number; end: number }

/** Where `now` is in today's working day. A weekend or other non-working day is "free". */
export function dayProgress(now: number, w: Workday = DEFAULT_WORKDAY, tz = TIME_ZONE): DayProgress {
  const p = localParts(now, tz), midnight = startOfDay(now, tz);
  const at = (hhmm: string) => { const m = minutesOf(hhmm); return zonedToEpoch(p.y, p.mo, p.d, Math.floor(m / 60), m % 60, tz) ?? midnight + m * 60_000; };
  const start = at(w.start), end = at(w.end);
  if (!w.days.includes(p.weekday)) return { phase: 'free', fraction: 0, leftMs: 0, start, end };
  if (now < start) return { phase: 'before', fraction: 0, leftMs: end - start, start, end };
  if (now >= end) return { phase: 'after', fraction: 1, leftMs: 0, start, end };
  return { phase: 'during', fraction: (now - start) / (end - start), leftMs: end - now, start, end };
}

/** Where an appointment sits on today's bar (0..1), or null when it is not during today's working day. */
export function positionOnDay(day: DayProgress, at: number): number | null {
  if (day.phase === 'free' || at < day.start || at > day.end) return null;
  return (at - day.start) / (day.end - day.start);
}


/** Work time or free time. Free time is after the working day and on days off; the morning before the day starts still counts as work. */
export type DayMode = 'work' | 'free';
export const modeAt = (now: number, w: WorkdayConfig = DEFAULT_WORKDAY, tz = TIME_ZONE): DayMode => { const p = dayProgress(now, w, tz).phase; return p === 'after' || p === 'free' ? 'free' : 'work'; };
