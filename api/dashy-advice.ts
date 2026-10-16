import { anthropic } from '@ai-sdk/anthropic';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createGenerate } from '../src/server/generateAdvice';
import { handleAdviceRequest } from '../src/server/adviceHandler';

/**
 * Vercel Function. Environment variables (Vercel project settings or .env.local):
 *   ANTHROPIC_API_KEY            Claude API key (server only, never in the app)
 *   DASHY_API_TOKEN              shared secret the app sends as a bearer token
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   for the rate limit
 *   DASHY_MODEL                  optional, default claude-opus-5-5
 */
const redisConfigured = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const limiter = redisConfigured
  ? new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(20, '1 h'), prefix: 'dashy-advice' })
  : null;

export async function POST(request: Request): Promise<Response> {
  return handleAdviceRequest(request, {
    token: process.env.DASHY_API_TOKEN,
    // No limiter configured = no model calls. Better a calm Dashy than an unbounded bill.
    allow: async key => (limiter ? (await limiter.limit(key)).success : false),
    generate: createGenerate(anthropic(process.env.DASHY_MODEL ?? 'claude-opus-5-5')),
  });
}

// Any other method gets the same safe shape instead of a platform 405 page.
export const GET = POST, PUT = POST, DELETE = POST, PATCH = POST;
