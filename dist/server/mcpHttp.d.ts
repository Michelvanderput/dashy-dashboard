import type { Store } from './dashyStore';
export interface McpHttpDeps {
    store: Store | null;
    now: () => number;
    /** Secret that lets Claude write. Different from the app's read-only token. */
    mcpToken: string | undefined;
    allow: (key: string) => Promise<boolean>;
    log?: (msg: string) => void;
}
/**
 * Remote MCP over Streamable HTTP, stateless (every request is self-contained, which is what serverless needs).
 * Order of checks: method, configuration, token, rate limit, body size. Details of failures go to the log, never to the caller.
 */
export declare function handleMcpRequest(req: Request, deps: McpHttpDeps): Promise<Response>;
