/**
 * Winding down: from a set time the screen dims, Dashy gets sleepy and the screen says what tomorrow starts with,
 * so your head can let it go. `VITE_WINDDOWN="22:30"` sets the time; "uit" turns it off.
 */
import { clockParts } from './clock';

export const DEFAULT_WINDDOWN = 22 * 60 + 30;
/** Minutes after midnight, the default when missing or invalid, or null for "uit"/"off". */
export function parseWindDown(text: string | undefined): number | null {
  const t = (text ?? '').trim().toLowerCase();
  if (t === 'uit' || t === 'off') return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : DEFAULT_WINDDOWN;
}
/** True from the set time until 05:00. Never in the day, so a late start never looks like night. */
export function isWindDown(now: number, startMin: number | null): boolean {
  if (startMin === null) return false;
  const c = clockParts(now), m = c.hour * 60 + Number(c.time.slice(3, 5));
  return m >= startMin || c.hour < 5;
}
