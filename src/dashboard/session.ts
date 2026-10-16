/**
 * A short focus session on ONE task ("Ik begin"). Why: starting is the hard part (task initiation), and time is easy to lose
 * (time blindness), so the time is shown and the start is small: 10 minutes, "hoeft niet af". Pure: time is passed in.
 */
export interface Session { taskId: string; title: string; startedAt: number; minutes: number }
export const SESSION_MINUTES = 10;
export const MORE_MINUTES = 10;

export const startSession = (task: { id: string; title: string }, now: number, minutes = SESSION_MINUTES): Session => ({ taskId: task.id, title: task.title, startedAt: now, minutes });
/** Extends by a block of minutes, from now (a new block, not a debt). */
export const extendSession = (s: Session, now: number, minutes = MORE_MINUTES): Session => ({ ...s, startedAt: now, minutes });
/** ms left; negative once the time is up. */
export const remainingMs = (s: Session, now: number): number => s.startedAt + s.minutes * 60_000 - now;
export const isOver = (s: Session, now: number): boolean => remainingMs(s, now) <= 0;
/** "9:41"; always the time that is left, never an overrun counter (no pressure). */
export function timerLabel(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
/** Spoken form for a screen reader; only called sparingly, not every second. */
export function timerSpoken(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  return m <= 1 ? 'nog een minuut' : `nog ${m} minuten`;
}
