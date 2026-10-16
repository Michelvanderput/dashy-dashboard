/**
 * The day on the screen: how far through the working day you are, and how long until the next appointment.
 * Pure: pass the time in. Times are Dutch wall-clock (see server/time.ts).
 */
import { DEFAULT_WORKDAY, type Appointment, type WorkdayConfig } from './server/plan';
import { localParts, startOfDay, zonedToEpoch, TIME_ZONE } from './server/time';
import { whenLabel } from './tasks';

export type Workday = WorkdayConfig;
export { DEFAULT_WORKDAY };
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

/** "minder dan 1 min", "25 min", "1 u", "3 u 20 min". Rounded up to the minute, so it never says 0 while there is still time. */
export function duration(ms: number): string {
  if (ms <= 0) return 'minder dan 1 min';
  const total = Math.ceil(ms / 60_000), h = Math.floor(total / 60), m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} u` : `${h} u ${m} min`;
}

/** An appointment within this long counts as "soon" (the countdown turns orange). */
export const SOON_MS = 10 * 60_000;
export interface AppointmentView {
  phase: 'upcoming' | 'now';
  leftMs: number;
  soon: boolean;
  /** "over 25 min", "nog 40 min", "morgen 09:00" */
  text: string;
}
/** How to show an appointment right now. Null once it is over. */
export function appointmentView(a: Appointment, now: number, tz = TIME_ZONE): AppointmentView | null {
  if (now >= (a.endsAt ?? a.at)) return null;
  if (now >= a.at) {
    const left = a.endsAt ? a.endsAt - now : 0;
    return { phase: 'now', leftMs: left, soon: false, text: a.endsAt ? `nog ${duration(left)}` : 'nu' };
  }
  const left = a.at - now;
  const sameDay = localParts(a.at, tz).date === localParts(now, tz).date;
  return { phase: 'upcoming', leftMs: left, soon: left <= SOON_MS, text: sameDay ? `over ${duration(left)}` : whenLabel(a.at, true, now) };
}
