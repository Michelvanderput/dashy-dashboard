/**
 * Which block needs attention right now, and for how long it keeps it. Pure: time is passed in.
 * Facts first (a deadline, an appointment), then moments (a celebration, new music). Nothing urgent = no focus: the calm layout.
 */
import type { Resolution } from '../driver';
import type { BlockId } from './layout';

export interface AttentionInput {
  now: number;
  resolution: Resolution;
  /** start of the next appointment (ms) or null */
  nextEventAt: number | null;
  /** when the current track or playback started (ms), or null when nothing plays */
  musicSince: number | null;
}
export interface Candidate { block: BlockId; reason: string; priority: number; /** how long a moment lasts; null = as long as the condition holds */ holdMs: number | null }

export const WINDOWS = { appointmentMs: 10 * 60_000, appointmentGraceMs: 2 * 60_000, doneMs: 4000, musicMs: 8000, minDwellMs: 10_000, pinMs: 10 * 60_000 } as const;

export function chooseAttention(i: AttentionInput): Candidate | null {
  const r = i.resolution.rule;
  if (r === 'deadlineNear') return { block: 'dashy', reason: 'Deadline binnen 15 minuten', priority: 100, holdMs: null };
  if (i.nextEventAt !== null) {
    const until = i.nextEventAt - i.now;
    if (until <= WINDOWS.appointmentMs && until >= -WINDOWS.appointmentGraceMs) return { block: 'now', reason: 'Afspraak binnen 10 minuten', priority: 90, holdMs: null };
  }
  if (r === 'blocked' || r === 'waiting') return { block: 'dashy', reason: r === 'blocked' ? 'Dashy zit vast' : 'Dashy wacht op jou', priority: 80, holdMs: null };
  if (r === 'deadlineSoon') return { block: 'plan', reason: 'Deadline binnen een uur', priority: 70, holdMs: null };
  if (r === 'done') return { block: 'dashy', reason: 'Klaar!', priority: 60, holdMs: WINDOWS.doneMs };
  if (i.musicSince !== null && i.now - i.musicSince < WINDOWS.musicMs) return { block: 'music', reason: 'Er klinkt muziek', priority: 40, holdMs: WINDOWS.musicMs };
  return null;
}

export interface FocusState { block: BlockId | null; reason: string; priority: number; since: number; /** moments end here; null = while the condition holds */ until: number | null; pinned: boolean }
export const CALM_FOCUS: FocusState = { block: null, reason: '', priority: 0, since: 0, until: null, pinned: false };
export interface Pin { block: BlockId; until: number }

/**
 * Decides the focus for this moment. The person always wins (a pin), then more important things interrupt at once,
 * while less important ones wait until the current focus has been up for at least 10 seconds (no flapping).
 */
export function nextFocus(prev: FocusState, cand: Candidate | null, pin: Pin | null, now: number, since = now): FocusState {
  if (pin && pin.until > now) return prev.block === pin.block && prev.pinned ? prev : { block: pin.block, reason: 'Door jou vergroot', priority: 1000, since: now, until: pin.until, pinned: true };
  let cur = prev;
  if (cur.pinned) cur = CALM_FOCUS;                                   // pin ended
  if (cur.block && cur.until !== null && now >= cur.until) cur = CALM_FOCUS; // a moment is over
  if (!cand) {
    if (!cur.block || cur.until !== null) return cur.block ? cur : CALM_FOCUS; // nothing, or a moment that is still running
    return now - cur.since >= WINDOWS.minDwellMs ? CALM_FOCUS : cur;           // the condition ended: stay a little, then go calm
  }
  const adopt = (): FocusState => ({ block: cand.block, reason: cand.reason, priority: cand.priority, since, until: cand.holdMs === null ? null : since + cand.holdMs, pinned: false });
  if (!cur.block) return adopt();
  if (cand.block === cur.block) {
    const until = cand.holdMs === null ? null : cur.until ?? since + cand.holdMs;
    return cur.reason === cand.reason && cur.priority === cand.priority && cur.until === until ? cur : { ...cur, reason: cand.reason, priority: cand.priority, until };
  }
  if (cand.priority > cur.priority) return adopt();
  return now - cur.since >= WINDOWS.minDwellMs ? adopt() : cur;
}
