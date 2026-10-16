/**
 * Dashy state driver: translates app events into one Dashy state.
 * Pure like core.ts: no DOM, no timers, no Date.now(). You pass the time in (ms) and ask
 * `nextWakeAt` when to look again, so the same rules can be ported to Swift and tested with fake time.
 */
import type { DashyState } from './core';
export type RuleName = 'done' | 'received' | 'blocked' | 'deadlineSoon' | 'deadlineNear' | 'waiting' | 'break' | 'working' | 'quiet' | 'idle';
/**
 * Highest priority first. The first rule that applies wins, so two rules never fight.
 * - done/received are short celebrations (a few seconds): they always get seen, then the next rule takes over.
 * - blocked outranks deadlines: Dashy needs help before he can nag.
 * - a deadline (angry, then strict) outranks waiting and a break: the director stays strict.
 */
export declare const RULES: readonly {
    rule: RuleName;
    state: DashyState;
}[];
export interface DriverConfig {
    /** Deadline within this many ms: strict. Default 1 hour. */
    strictWithinMs: number;
    /** Deadline within this many ms: angry. Default 15 minutes. */
    angryWithinMs: number;
    /** A deadline stays angry this long after it passed, then it is ignored. Default 15 minutes. */
    overdueGraceMs: number;
    /** Nothing done for this long: sad. Default 1 hour. */
    quietAfterMs: number;
    /** How long `done` shows. Matches core.ts (done falls back to idle after 3600 ms). */
    doneMs: number;
    /** How long `received` shows. Matches core.ts (received continues to working after 650 ms). */
    receivedMs: number;
}
export declare const DEFAULT_CONFIG: DriverConfig;
export type DriverEvent = {
    type: 'taskAdded';
    id: string;
    dueAt?: number | null;
} | {
    type: 'taskDone';
    id: string;
} | {
    type: 'taskRemoved';
    id: string;
} | {
    type: 'taskDueChanged';
    id: string;
    dueAt: number | null;
}
/** The app waits for an answer from the user. */
 | {
    type: 'waiting';
    value: boolean;
}
/** The app cannot continue. */
 | {
    type: 'blocked';
    value: boolean;
} | {
    type: 'break';
    value: boolean;
} | {
    type: 'working';
    value: boolean;
}
/** Any sign of life (typing, clicking, finishing something) that resets the "nothing done" timer. */
 | {
    type: 'activity';
};
export interface DriverState {
    /** Open tasks: id -> due time (ms) or null. */
    readonly tasks: Readonly<Record<string, number | null>>;
    readonly receivedAt: number | null;
    readonly doneAt: number | null;
    readonly waiting: boolean;
    readonly blocked: boolean;
    readonly onBreak: boolean;
    readonly working: boolean;
    readonly lastActivityAt: number;
}
export interface Resolution {
    state: DashyState;
    rule: RuleName;
}
export declare function initialDriverState(now: number): DriverState;
/** Returns a new state; never mutates the old one. */
export declare function reduce(s: DriverState, e: DriverEvent, now: number): DriverState;
export declare function resolve(s: DriverState, now: number, config?: Partial<DriverConfig>): Resolution;
/**
 * The next moment (ms) at which the result may change by itself, or null when it only changes on an event.
 * Schedule one timeout for this instead of polling.
 */
export declare function nextWakeAt(s: DriverState, now: number, config?: Partial<DriverConfig>): number | null;
