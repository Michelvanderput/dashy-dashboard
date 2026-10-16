/**
 * Ambient life: the tiny movements a living thing never stops making.
 * Pure like core.ts: no DOM, no timers, no randomness. Everything is a function of time, so it replays exactly.
 * - eyes: micro-saccades (the eyes jump a hair, rest, jump again)
 * - body: slow drift (a hair of float and sway, never still)
 * Units are core units (the 300 x 300 coordinate system), amplitudes stay around one or two units on purpose.
 */
import type { DashyState } from './core';
export interface Ambient {
    eyeX: number;
    eyeY: number;
    bodyX: number;
    bodyY: number;
    bodyRot: number;
}
export interface AmbientWeights {
    eye: number;
    body: number;
}
/**
 * How much of each ambient layer a state gets (0..1). States that already have their own strong motion
 * (working scans, angry and blocked shake, dancing bounces) get none, so two movements never fight.
 */
export declare const AMBIENT_WEIGHTS: Record<DashyState, AmbientWeights>;
/** Offsets at time `ms`. `w` scales each layer (use AMBIENT_WEIGHTS[state], smoothed), `strength` scales everything (1 = default). */
export declare function ambientAt(ms: number, w: AmbientWeights, strength?: number): Ambient;
