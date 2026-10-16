import { handleMcp } from '../../src/server/mcp.js';
import { storeFromEnv, workdayFromEnv } from '../../src/server/env.js';

/** For connectors that cannot send a header: POST https://<app>/api/mcp/<DASHY_MCP_TOKEN>. The secret ends up in logs, so use /api/mcp when you can. */
const run = (req: Request) => handleMcp(req, { store: storeFromEnv(), token: process.env.DASHY_MCP_TOKEN, now: Date.now, workday: workdayFromEnv(), allowPathToken: true });
export const GET = run, POST = run, PUT = run, DELETE = run, PATCH = run;
