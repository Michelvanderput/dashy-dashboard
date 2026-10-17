/**
 * A short working session ("do 10 minutes"): starting is the hard part, so the promise is small and you may stop when it ends.
 * Pure: you pass the time in. Lives on this device only. After 90 minutes in one go it suggests a drink or a bite, once, quietly.
 */
export const FOCUS_CHOICES = [10, 25, 45] as const;
export const FOCUS_BREAK_AFTER_MIN = 90;
const MAX_MIN = 240;

export interface Focus { startedAt: number; minutes: number; taskId: string | null }
export interface FocusView {
  over: boolean; leftMs: number; totalMs: number;
  /** remaining share, 1 at the start down to 0 */ fraction: number;
  elapsedMin: number; /** true after 90 minutes in one go */ suggestBreak: boolean; mmss: string;
}
export const startFocus = (now: number, minutes: number, taskId: string | null = null): Focus => ({ startedAt: now, minutes: Math.max(1, Math.min(MAX_MIN, Math.round(minutes))), taskId });
export const extendFocus = (f: Focus, minutes: number): Focus => ({ ...f, minutes: Math.min(MAX_MIN * 2, f.minutes + Math.max(1, Math.round(minutes))) });

export function focusView(f: Focus, now: number): FocusView {
  const totalMs = f.minutes * 60_000, elapsed = Math.max(0, now - f.startedAt), leftMs = Math.max(0, totalMs - elapsed);
  const s = Math.ceil(leftMs / 1000);
  return {
    over: leftMs === 0, leftMs, totalMs, fraction: totalMs ? leftMs / totalMs : 0,
    elapsedMin: Math.floor(elapsed / 60_000), suggestBreak: elapsed >= FOCUS_BREAK_AFTER_MIN * 60_000,
    mmss: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  };
}
/** What was stored, or null when it is not a valid session. A session that ended more than 12 hours ago is forgotten. */
export function parseFocus(text: string | null, now: number): Focus | null {
  try {
    const v = JSON.parse(text ?? 'null') as Record<string, unknown> | null;
    if (!v || typeof v.startedAt !== 'number' || typeof v.minutes !== 'number' || !Number.isFinite(v.startedAt) || !(v.minutes >= 1 && v.minutes <= MAX_MIN * 2)) return null;
    if (v.startedAt > now + 60_000 || now - v.startedAt > v.minutes * 60_000 + 12 * 3600_000) return null;
    return { startedAt: v.startedAt, minutes: v.minutes, taskId: typeof v.taskId === 'string' ? v.taskId.slice(0, 64) : null };
  } catch { return null; }
}
