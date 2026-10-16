import { handleMcp } from '../src/server/mcp.js';
import { storeFromEnv } from '../src/server/env.js';

/** Claude's connector: POST https://<app>/api/mcp with  Authorization: Bearer <DASHY_MCP_TOKEN>. */
const run = (req: Request) => handleMcp(req, { store: storeFromEnv(), token: process.env.DASHY_MCP_TOKEN, now: Date.now });
export const GET = run, POST = run, PUT = run, DELETE = run, PATCH = run;
