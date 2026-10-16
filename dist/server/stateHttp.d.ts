import { type Store } from './dashyStore';
export interface StateHttpDeps {
    store: Store | null;
    now: () => number;
    /** Read-only secret for the app. It cannot call the MCP. */
    stateToken: string | undefined;
    allow: (key: string) => Promise<boolean>;
    log?: (msg: string) => void;
}
export interface StateBody {
    state: string;
    line: string;
    source: 'driver' | 'claude' | 'fallback';
    rule: string;
    nextWakeAt: number | null;
    rev: number;
    at: number;
}
/** What the app polls: the state Dashy should show right now. Every answer, also an error, is a valid state body. */
export declare function handleStateRequest(req: Request, deps: StateHttpDeps): Promise<Response>;
