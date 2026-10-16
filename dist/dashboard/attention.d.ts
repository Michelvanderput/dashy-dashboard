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
export interface Candidate {
    block: BlockId;
    reason: string;
    priority: number; /** how long a moment lasts; null = as long as the condition holds */
    holdMs: number | null;
}
export declare const WINDOWS: {
    readonly appointmentMs: number;
    readonly appointmentGraceMs: number;
    readonly doneMs: 4000;
    readonly musicMs: 8000;
    readonly minDwellMs: 10000;
    readonly pinMs: number;
};
export declare function chooseAttention(i: AttentionInput): Candidate | null;
export interface FocusState {
    block: BlockId | null;
    reason: string;
    priority: number;
    since: number; /** moments end here; null = while the condition holds */
    until: number | null;
    pinned: boolean;
}
export declare const CALM_FOCUS: FocusState;
export interface Pin {
    block: BlockId;
    until: number;
}
/**
 * Decides the focus for this moment. The person always wins (a pin), then more important things interrupt at once,
 * while less important ones wait until the current focus has been up for at least 10 seconds (no flapping).
 */
export declare function nextFocus(prev: FocusState, cand: Candidate | null, pin: Pin | null, now: number, since?: number): FocusState;
