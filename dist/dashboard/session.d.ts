/**
 * A short focus session on ONE task ("Ik begin"). Why: starting is the hard part (task initiation), and time is easy to lose
 * (time blindness), so the time is shown and the start is small: 10 minutes, "hoeft niet af". Pure: time is passed in.
 */
export interface Session {
    taskId: string;
    title: string;
    startedAt: number;
    minutes: number;
}
export declare const SESSION_MINUTES = 10;
export declare const MORE_MINUTES = 10;
export declare const startSession: (task: {
    id: string;
    title: string;
}, now: number, minutes?: number) => Session;
/** Extends by a block of minutes, from now (a new block, not a debt). */
export declare const extendSession: (s: Session, now: number, minutes?: number) => Session;
/** ms left; negative once the time is up. */
export declare const remainingMs: (s: Session, now: number) => number;
export declare const isOver: (s: Session, now: number) => boolean;
/** "9:41"; always the time that is left, never an overrun counter (no pressure). */
export declare function timerLabel(ms: number): string;
/** Spoken form for a screen reader; only called sparingly, not every second. */
export declare function timerSpoken(ms: number): string;
