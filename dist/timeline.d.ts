/**
 * Sequences: a timeline of expressions (a built-in state, or a custom look) with hold time and transition per step,
 * played once, looped or ping-pong. Pure like driver.ts: you pass the time in, it tells you which step is on.
 */
import type { DashyState } from './core';
/** The eye settings an expression can change. Same names and meaning as the table in core.ts. */
export interface Look {
    /** change of the distance between the eyes (core units) */ sd?: number;
    /** eye height */ eh?: number;
    /** upper lid, 0..1 */ cover?: number;
    /** lid slant in degrees, + angry, - sad */ lidA?: number;
    /** curved lower lid (happy arcs), 0..1 */ low?: number;
    /** eye tilt in degrees */ tilt?: number;
    /** left/right difference in lid height */ asym?: number;
}
export interface Expression {
    /** Built-in state to take the body motion from. Omit to keep the current one. */
    state?: DashyState;
    look?: Look;
}
export type Ease = 'spring' | 'smooth' | 'snappy';
export interface BlinkConfig {
    enabled?: boolean;
    minMs?: number;
    maxMs?: number;
    durationMs?: number;
}
export interface Step {
    /** Key of a custom expression, or the name of a built-in state. */
    expression: string;
    holdMs: number;
    transitionMs: number;
    ease?: Ease;
}
export type PlaybackMode = 'loop' | 'once' | 'pingPong';
export interface Sequence {
    mode: PlaybackMode;
    steps: Step[];
    blink?: BlinkConfig;
}
export declare const LOOK_RANGE: Record<keyof Look, [number, number]>;
/** Spring constants (stiffness k, damping d, as in core.ts) that settle in about `transitionMs`. */
export declare function springFor(transitionMs: number, ease?: Ease): {
    k: number;
    d: number;
};
/** Index of the step on screen `elapsed` ms after the start, or done when a once-sequence has finished (it holds its last step). */
export declare function stepAt(seq: Sequence, elapsed: number): {
    index: number;
    done: boolean;
};
export interface SequencePlayer {
    /** Start (or restart) at `now`. */
    start(now: number): void;
    /** Call every frame. `changed` is true on the first call of each new step (apply `step` then); `done` once a once-sequence ended. */
    tick(now: number): {
        changed: boolean;
        step: Step;
        done: boolean;
    };
}
export declare function createSequencePlayer(seq: Sequence): SequencePlayer;
