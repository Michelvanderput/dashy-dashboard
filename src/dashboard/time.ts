/** Dutch wall-clock helpers (pure). The server runs in UTC, the person lives in Amsterdam. */
import { TZ, dayKey } from './habits';

/** ms epoch of HH:MM on a "YYYY-MM-DD" day in Dutch time (handles summer and winter time). */
export function zonedMs(day: string, hour: number, minute = 0): number {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  // the offset of Amsterdam at that moment; try the guess, then correct once (covers the clock-change days well enough)
  const offset = (t: number) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(t); const g = (k: string) => Number(p.find(x => x.type === k)!.value); return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - t; };
  const first = guess - offset(guess);
  return guess - offset(first);
}
export const hourIn = (ms: number): number => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit' }).format(ms));

export type Later = 'plus30' | 'tomorrow';
export const LATER: readonly Later[] = ['plus30', 'tomorrow'];
/** A new moment for a task: in half an hour, or tomorrow at 09:00 (Dutch time). */
export function laterMs(until: Later, now: number): number {
  if (until === 'plus30') return now + 30 * 60_000;
  const [y, m, d] = dayKey(now).split('-').map(Number);
  return zonedMs(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), 9);
}
export type PartOfDay = 'morning' | 'day' | 'evening';
/** Before 10: morning. From 21 until 5: evening. */
export function partOfDay(now: number): PartOfDay { const h = hourIn(now); return h >= 5 && h < 10 ? 'morning' : h >= 21 || h < 5 ? 'evening' : 'day'; }
