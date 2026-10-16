import { type Store } from './dashyStore';
export interface ActionHttpDeps {
    store: Store | null;
    now: () => number;
    /** Lets the screen check a task off or undo it, nothing else. Different from the MCP token (Claude) and the read-only token. */
    actionToken: string | undefined;
    allow: (key: string) => Promise<boolean>;
    log?: (msg: string) => void;
}
/** POST {action: 'done' | 'undo', id}. Answers with the fresh state body; every error answers with the calm shape. */
export declare function handleActionRequest(req: Request, deps: ActionHttpDeps): Promise<Response>;
