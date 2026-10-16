/**
 * Habits without streaks. A broken streak feels like failure and often ends the habit, so the screen only says
 * "x van y deze week": a missed day costs nothing. Every habit can carry an if-then plan ("Als ik koffie zet, dan …"):
 * implementation intentions have a medium-to-large effect on follow-through (Gollwitzer & Sheeran 2006, d ≈ 0.65).
 * Pure: time is passed in. Days are counted in Dutch time.
 */
export interface Habit {
    id: string;
    title: string; /** target per week, 1-7 */
    perWeek: number; /** "Als …, dan …" */
    plan?: string; /** days done, "YYYY-MM-DD", newest last (kept 28 days) */
    done: string[];
}
export declare const HABIT_LIMITS: {
    readonly count: 12;
    readonly title: 40;
    readonly plan: 100;
    readonly keepDays: 28;
};
export declare const TZ = "Europe/Amsterdam";
/** "2026-10-16" in Dutch time. */
export declare const dayKey: (ms: number) => string;
/** Monday to Sunday week containing `now`: the 7 day keys. */
export declare function weekDays(now: number): string[];
export declare const doneToday: (h: Habit, now: number) => boolean;
export declare const weekCount: (h: Habit, now: number) => number;
export declare const weekGoalMet: (h: Habit, now: number) => boolean;
/** Marks or unmarks today. Idempotent. Old days beyond the keep window are dropped. */
export declare function setToday(h: Habit, value: boolean, now: number): Habit;
/** The habit worth mentioning right now: not done today and the week's goal is not met yet. Fewest left in the week first. */
export declare function habitToNudge(habits: readonly Habit[], now: number): Habit | null;
