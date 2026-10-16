import { handleState } from '../src/server/mcp.js';
import { storeFromEnv, workdayFromEnv } from '../src/server/env.js';

/** What the screen polls: GET https://<app>/api/state with  Authorization: Bearer <DASHY_STATE_TOKEN>. Read-only. */
const run = (req: Request) => handleState(req, { store: storeFromEnv(), token: process.env.DASHY_STATE_TOKEN, now: Date.now, workday: workdayFromEnv() });
export const GET = run, POST = run, PUT = run, DELETE = run, PATCH = run, OPTIONS = run;
