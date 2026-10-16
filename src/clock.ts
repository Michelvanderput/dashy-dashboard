/** The clock and the date, in Dutch. Pure: pass the time in. */
import { localParts, TIME_ZONE } from './server/time';

const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const p2 = (n: number) => String(n).padStart(2, '0');

export interface ClockParts { /** "14:05" */ time: string; /** "vrijdag 16 oktober" */ date: string; week: number; hour: number; /** "2026-10-16T14:05" for the <time> element */ iso: string }

export function clockParts(now: number, tz = TIME_ZONE): ClockParts {
  const p = localParts(now, tz);
  return { time: `${p2(p.h)}:${p2(p.mi)}`, date: `${DAYS[p.weekday]} ${p.d} ${MONTHS[p.mo - 1]}`, week: isoWeek(p.y, p.mo, p.d), hour: p.h, iso: `${p.date}T${p2(p.h)}:${p2(p.mi)}` };
}

/** ISO 8601 week number (the week with the first Thursday of the year is week 1; weeks start on Monday). */
export function isoWeek(y: number, m: number, d: number): number {
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  date.setUTCDate(date.getUTCDate() + 4 - day); // the Thursday of this week decides the year
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** Milliseconds until the next full minute (plus a hair, so the timer never fires a moment early), for a clock that only shows minutes. */
export const msToNextMinute = (now: number) => 60_000 - (now % 60_000) + 30;
