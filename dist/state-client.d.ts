import type { DashyState } from './core';
import { type Habit } from './dashboard/habits';
import type { PlanItem } from './dashboard/plan';
export interface RemoteState {
    state: DashyState;
    line: string;
    source: 'driver' | 'claude' | 'fallback';
    nextWakeAt: number | null;
    rev: number; /** which driver rule decided, when the server says */
    rule?: string; /** the plan (titles), when the server keeps it */
    items: PlanItem[];
    focusId: string | null;
    habits: Habit[];
    flags: Flags; /** minutes of focus today */
    focusedMinutes: number;
}
export interface Flags {
    break: boolean;
    blocked: boolean;
    waiting: boolean;
}
export interface StateClientOptions {
    url: string;
    token: string;
    timeoutMs?: number;
    fetch?: typeof fetch;
}
export declare const CALM: RemoteState;
/** Strict check of the state body; throws on anything unexpected. Unknown extra keys are ignored (the server may add some). */
export declare function parseRemoteState(raw: unknown): RemoteState;
/** Never throws, never hangs: any error, timeout, bad status or invalid body gives the calm fallback (idle, no text). */
export declare function fetchDashyState(o: StateClientOptions): Promise<RemoteState>;
export type ActionKind = 'done' | 'undo' | 'add' | 'focus' | 'check' | 'uncheck' | 'later' | 'focused' | 'flag';
/** Check off (or undo) a task. Resolves to the fresh state, or null when it did not work (the screen then just keeps what it has). */
export declare function sendAction(o: {
    url: string;
    token: string;
    action: ActionKind;
    id?: string | null;
    title?: string;
    until?: 'plus30' | 'tomorrow';
    minutes?: number;
    flag?: 'break' | 'blocked' | 'waiting';
    value?: boolean;
    timeoutMs?: number;
    fetch?: typeof fetch;
}): Promise<RemoteState | null>;
