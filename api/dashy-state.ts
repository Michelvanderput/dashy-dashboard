import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { originsFrom } from '../src/server/cors';
import { parseDoc, type Store } from '../src/server/dashyStore';
import { handleStateRequest } from '../src/server/stateHttp';

/**
 * What the app polls: GET https://<your-app>.vercel.app/api/dashy-state
 *   DASHY_STATE_TOKEN   read-only secret for the app (Authorization: Bearer ...). It cannot write.
 */
const configured = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = configured ? Redis.fromEnv() : null;
const store: Store | null = redis ? { load: async () => parseDoc(await redis.get('dashy:v1')), save: async () => { throw new Error('read-only'); } } : null;
const limiter = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, '1 m'), prefix: 'dashy-state' }) : null;

export async function GET(request: Request): Promise<Response> {
  return handleStateRequest(request, {
    store, now: Date.now, stateToken: process.env.DASHY_STATE_TOKEN,
    allowedOrigins: originsFrom(process.env.DASHY_ALLOWED_ORIGINS),
    allow: async key => (limiter ? (await limiter.limit(key)).success : false),
  });
}
export const OPTIONS = GET, POST = GET, PUT = GET, DELETE = GET, PATCH = GET;
