import { handlePair } from '../src/server/pair.js';

/** A new screen sends its pairing code here and gets the screen keys back: POST https://<app>/api/pair  { "code": "K7M2-9QXA" }. */
const run = (req: Request) => handlePair(req, { secret: process.env.DASHY_MCP_TOKEN, stateToken: process.env.DASHY_STATE_TOKEN, actionToken: process.env.DASHY_ACTION_TOKEN, now: Date.now });
export const GET = run, POST = run, PUT = run, DELETE = run, PATCH = run, OPTIONS = run;
