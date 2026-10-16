import type { DashyState } from './core';
export interface RemoteState {
    state: DashyState;
    line: string;
    source: 'driver' | 'claude' | 'fallback';
    nextWakeAt: number | null;
    rev: number;
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
