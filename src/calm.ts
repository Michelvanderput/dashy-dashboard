/**
 * "Even lastig": for the moment the urge or the boredom comes (evenings, alone). Your own plan, written when you were fine,
 * and a quiet fifteen minutes with the wave timer: the urge comes up and goes down again. Nothing here is ever sent anywhere:
 * it stays in this device's own storage (the server and Claude never see it).
 */
export const WAVE_MS = 15 * 60_000;
export const PLAN_LINES_MAX = 6, LINE_MAX = 120;

export interface CalmPlan { lines: string[]; /** one concrete thing for the evening, or '' */ evening: string }
export const EMPTY_PLAN: CalmPlan = { lines: [], evening: '' };
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, LINE_MAX);

export function parseCalmPlan(text: string | null): CalmPlan {
  try {
    const v = JSON.parse(text ?? 'null') as Record<string, unknown> | null;
    if (!v) return EMPTY_PLAN;
    return { lines: Array.isArray(v.lines) ? v.lines.filter((x): x is string => typeof x === 'string').map(tidy).filter(Boolean).slice(0, PLAN_LINES_MAX) : [], evening: typeof v.evening === 'string' ? tidy(v.evening) : '' };
  } catch { return EMPTY_PLAN; }
}
/** From the text field: one line per thing, empty lines dropped. */
export const planFromText = (lines: string, evening: string): CalmPlan => ({ lines: lines.split('\n').map(tidy).filter(Boolean).slice(0, PLAN_LINES_MAX), evening: tidy(evening) });

export interface WaveView { over: boolean; leftMs: number; fraction: number; mmss: string; message: string }
const MESSAGES = ['Dit gaat voorbij. Een golf komt op en zakt weer.', 'Je hoeft niets op te lossen. Alleen dit kwartier door.', 'Het wordt al zachter. Je bent er bijna.'];
export function waveView(startedAt: number, now: number): WaveView {
  const elapsed = Math.max(0, now - startedAt), leftMs = Math.max(0, WAVE_MS - elapsed), s = Math.ceil(leftMs / 1000);
  const over = leftMs === 0;
  return { over, leftMs, fraction: leftMs / WAVE_MS, mmss: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
    message: over ? 'Het kwartier is om. Hoe voelt het nu? Nog een kwartier mag altijd.' : MESSAGES[Math.min(2, Math.floor(elapsed / (WAVE_MS / 3)))] };
}
/** A stored wave start, or null when it is not a time or older than two hours. */
export function parseWave(text: string | null, now: number): number | null {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 && n <= now + 60_000 && now - n < 2 * 3600_000 ? n : null;
}
