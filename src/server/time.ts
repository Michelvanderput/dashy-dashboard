/** Wall-clock time in one IANA zone (default Europe/Amsterdam), DST-safe, no dependencies. */
export const TIME_ZONE = 'Europe/Amsterdam';

export interface Parts { date: string; y: number; mo: number; d: number; h: number; mi: number; weekday: number; minutes: number }
const fmts = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmts.get(tz);
  if (!f) fmts.set(tz, f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }));
  return f;
}
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const p2 = (n: number) => String(n).padStart(2, '0');

/** The clock on the wall in `tz` at epoch `ms`. */
export function localParts(ms: number, tz = TIME_ZONE): Parts {
  const o: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) o[x.type] = x.value;
  const y = +o.year, mo = +o.month, d = +o.day, h = +o.hour, mi = +o.minute;
  return { date: `${y}-${p2(mo)}-${p2(d)}`, y, mo, d, h, mi, weekday: WD[o.weekday], minutes: h * 60 + mi };
}

/**
 * Epoch ms of a wall-clock time in `tz`, or null when that time does not exist (the hour skipped when the clocks go forward,
 * or a date like 2026-02-30). An ambiguous time (the hour repeated when the clocks go back) takes the first occurrence.
 */
export function zonedToEpoch(y: number, mo: number, d: number, h: number, mi: number, tz = TIME_ZONE): number | null {
  const probe = new Date(Date.UTC(y, mo - 1, d, 12));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // try both offsets around the day; the first one that reads back to the same wall time wins (earliest = first occurrence)
  const cands = new Set<number>();
  for (const guess of [wall - 3 * 3600_000, wall - 2 * 3600_000, wall - 1 * 3600_000, wall, wall - 0.5 * 3600_000]) {
    const p = localParts(guess, tz), off = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - guess;
    const at = wall - off, q = localParts(at, tz);
    if (q.y === y && q.mo === mo && q.d === d && q.h === h && q.mi === mi) cands.add(at);
  }
  return cands.size ? Math.min(...cands) : null;
}
export const startOfDay = (ms: number, tz = TIME_ZONE) => { const p = localParts(ms, tz); return zonedToEpoch(p.y, p.mo, p.d, 0, 0, tz) as number; };
/** Adds whole calendar days on the wall clock (a day is 23 or 25 hours across a clock change). */
export function addDays(y: number, mo: number, d: number, n: number): { y: number; mo: number; d: number } {
  const t = new Date(Date.UTC(y, mo - 1, d + n)); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
