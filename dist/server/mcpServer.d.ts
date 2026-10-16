import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Store } from './dashyStore';
export interface McpDeps {
    store: Store;
    now: () => number;
    log?: (msg: string) => void;
}
/**
 * The MCP server Claude talks to. Tools only report facts or set a mood: the shown state always comes from the
 * state driver and its priorities (a deadline beats a mood). Every result says what Dashy shows now and why.
 */
export declare function createDashyMcp(deps: McpDeps): McpServer;
