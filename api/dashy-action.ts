import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { originsFrom } from '../src/server/cors';
import { parseDoc, type Store } from '../src/server/dashyStore';
import { handleActionRequest } from '../src/server/actionHttp';

/**
 * The screen checks a task off: POST https://<your-app>.vercel.app/api/dashy-action  {"action":"done"|"undo","id":"..."}
 *   DASHY_ACTION_TOKEN   secret for the screen (Authorization: Bearer ...). It can only check tasks off and undo that.
 */
const configured = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = configured ? Redis.fromEnv() : null;
const KEY = 'dashy:v1';
const store: Store | null = redis ? { load: async () => parseDoc(await redis.get(KEY)), save: async doc => { await redis.set(KEY, doc); } } : null;
const limiter = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'), prefix: 'dashy-action' }) : null;

export async function POST(request: Request): Promise<Response> {
  return handleActionRequest(request, {
    store, now: Date.now, actionToken: process.env.DASHY_ACTION_TOKEN,
    allowedOrigins: originsFrom(process.env.DASHY_ALLOWED_ORIGINS),
    allow: async key => (limiter ? (await limiter.limit(key)).success : false),
  });
}
export const GET = POST, OPTIONS = POST, PUT = POST, DELETE = POST, PATCH = POST;
