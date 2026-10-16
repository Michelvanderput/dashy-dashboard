import type { Habit } from '../dashboard/habits';
import type { PlanItem } from '../dashboard/plan';
import { type Doc, type Store } from './dashyStore';
export interface StateHttpDeps {
    store: Store | null;
    now: () => number;
    /** Read-only secret for the app. It cannot call the MCP. */
    stateToken: string | undefined;
    allow: (key: string) => Promise<boolean>;
    log?: (msg: string) => void;
    /** Origins of desktop shells that may call this endpoint (see cors.ts). Default: none. */
    allowedOrigins?: readonly string[];
}
export interface StateBody {
    state: string;
    line: string;
    source: 'driver' | 'claude' | 'fallback';
    rule: string;
    nextWakeAt: number | null;
    rev: number;
    at: number;
    items: PlanItem[];
    focusId: string | null;
    habits: Habit[];
    flags: {
        break: boolean;
        blocked: boolean;
        waiting: boolean;
    };
    focusedMinutes: number;
}
/** What the screen needs from the document: the state to show, and the plan. */
export declare function buildStateBody(doc: Doc, now: number): StateBody;
export declare const reply: (status: number, b: StateBody, reason?: string) => Response;
/** What the app polls: the state Dashy should show right now. Every answer, also an error, is a valid state body. */
export declare function handleStateRequest(req: Request, deps: StateHttpDeps): Promise<Response>;
