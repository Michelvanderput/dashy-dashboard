import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { parseDoc, type Store } from '../src/server/dashyStore';
import { handleMcpRequest } from '../src/server/mcpHttp';

/**
 * Remote MCP endpoint: https://<your-app>.vercel.app/api/mcp
 *   DASHY_MCP_TOKEN                                      secret for Claude (Authorization: Bearer ..., or ?key=...)
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN    where Dashy's state lives
 */
const configured = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = configured ? Redis.fromEnv() : null;
const KEY = 'dashy:v1';
const store: Store | null = redis ? {
  load: async () => parseDoc(await redis.get(KEY)),
  save: async doc => { await redis.set(KEY, doc); },
} : null;
const limiter = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'), prefix: 'dashy-mcp' }) : null;

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request, {
    store, now: Date.now, mcpToken: process.env.DASHY_MCP_TOKEN,
    allow: async key => (limiter ? (await limiter.limit(key)).success : false),
  });
}
// Stateless server: no SSE stream (GET) and no sessions (DELETE). Answer those with the same 405.
export const GET = POST, DELETE = POST, PUT = POST, PATCH = POST;
