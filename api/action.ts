import { handleAction } from '../src/server/mcp.js';
import { storeFromEnv } from '../src/server/env.js';

/** What the screen may write: POST https://<app>/api/action {"action":"done"|"undo","id":"…"} with  Authorization: Bearer <DASHY_ACTION_TOKEN>. Nothing else. */
const run = (req: Request) => handleAction(req, { store: storeFromEnv(), token: process.env.DASHY_ACTION_TOKEN, now: Date.now });
export const GET = run, POST = run, PUT = run, DELETE = run, PATCH = run, OPTIONS = run;
