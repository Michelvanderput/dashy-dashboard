/**
 * The day on the screen: how far through the working day you are, and how long until the next appointment.
 * Pure: pass the time in. Times are Dutch wall-clock (see server/time.ts).
 */
import type { Appointment } from './server/plan';
import { localParts, TIME_ZONE } from './server/time';
import { dayProgress } from './server/workday';
export { DEFAULT_WORKDAY, dayProgress, positionOnDay, type DayPhase, type DayProgress, type Workday } from './server/workday';
import { whenLabel } from './tasks';

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

/** The reminder to book hours shows from 15 minutes before the end of the working day, and stays until midnight (never on a day off). */
export const BOOKING_LEAD_MS = 15 * 60_000;
export function isBookingTime(now: number, w?: import('./server/workday').Workday, tz = TIME_ZONE): boolean {
  const d = dayProgress(now, w, tz);
  if (d.phase === 'free' || d.phase === 'before') return false;
  return d.phase === 'after' || d.end - now <= BOOKING_LEAD_MS;
}
