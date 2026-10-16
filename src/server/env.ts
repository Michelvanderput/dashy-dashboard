import { MemoryStore, UpstashStore, type Store } from './store';
/** The store for this deployment: Upstash when its variables are set, otherwise null (the endpoints then answer 503, they never pretend). */
let cached: Store | null | undefined;
export function storeFromEnv(env: Record<string, string | undefined> = process.env): Store | null {
  if (cached !== undefined && env === process.env) return cached;
  // Upstash's own names, or the KV_* names that the Vercel Marketplace integration fills in for you.
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL, token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  const s = url && token ? new UpstashStore({ url, token }) : null;
  if (env === process.env) cached = s;
  return s;
}
export { MemoryStore };
