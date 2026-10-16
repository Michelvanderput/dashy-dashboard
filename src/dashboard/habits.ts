/**
 * Habits without streaks. A broken streak feels like failure and often ends the habit, so the screen only says
 * "x van y deze week": a missed day costs nothing. Every habit can carry an if-then plan ("Als ik koffie zet, dan …"):
 * implementation intentions have a medium-to-large effect on follow-through (Gollwitzer & Sheeran 2006, d ≈ 0.65).
 * Pure: time is passed in. Days are counted in Dutch time.
 */
export interface Habit { id: string; title: string; /** target per week, 1-7 */ perWeek: number; /** "Als …, dan …" */ plan?: string; /** days done, "YYYY-MM-DD", newest last (kept 28 days) */ done: string[] }
export const HABIT_LIMITS = { count: 12, title: 40, plan: 100, keepDays: 28 } as const;
export const TZ = 'Europe/Amsterdam';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** "2026-10-16" in Dutch time. */
export const dayKey = (ms: number): string => fmt.format(ms);
const DAY = 24 * 3600_000;

/** Monday to Sunday week containing `now`: the 7 day keys. */
export function weekDays(now: number): string[] {
  const [y, m, d] = dayKey(now).split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = Monday
  const monday = Date.UTC(y, m - 1, d) - dow * DAY;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY).toISOString().slice(0, 10));
}
export const doneToday = (h: Habit, now: number): boolean => h.done.includes(dayKey(now));
export const weekCount = (h: Habit, now: number): number => { const w = new Set(weekDays(now)); return h.done.filter(d => w.has(d)).length; };
export const weekGoalMet = (h: Habit, now: number): boolean => weekCount(h, now) >= h.perWeek;

/** Marks or unmarks today. Idempotent. Old days beyond the keep window are dropped. */
export function setToday(h: Habit, value: boolean, now: number): Habit {
  const today = dayKey(now), cutoff = dayKey(now - HABIT_LIMITS.keepDays * DAY);
  const rest = h.done.filter(d => d !== today && d >= cutoff);
  return { ...h, done: value ? [...rest, today].sort() : rest };
}

/** The habit worth mentioning right now: not done today and the week's goal is not met yet. Fewest left in the week first. */
export function habitToNudge(habits: readonly Habit[], now: number): Habit | null {
  const open = habits.filter(h => !doneToday(h, now) && !weekGoalMet(h, now));
  return open.sort((a, b) => (a.perWeek - weekCount(a, now)) - (b.perWeek - weekCount(b, now)) || a.title.localeCompare(b.title))[0] ?? null;
}
