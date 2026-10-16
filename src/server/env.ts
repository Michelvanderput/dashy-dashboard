import { MemoryStore, SupabaseStore, UpstashStore, type Store } from './store.js';
import { parseWorkday, type WorkdayConfig } from './plan.js';
/** The store for this deployment: Supabase when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, else Upstash Redis, otherwise null (the endpoints then answer 503, they never pretend). */
let cached: Store | null | undefined;
export function storeFromEnv(env: Record<string, string | undefined> = process.env): Store | null {
  if (cached !== undefined && env === process.env) return cached;
  // Upstash's own names, or the KV_* names that the Vercel Marketplace integration fills in for you.
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL, token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  const sbUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL, sbKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const s: Store | null = sbUrl && sbKey ? new SupabaseStore({ url: sbUrl, serviceKey: sbKey }) : url && token ? new UpstashStore({ url, token }) : null;
  if (env === process.env) cached = s;
  return s;
}
/** DASHY_WORKDAY="08:30-17:00": when the working day starts and ends (Mon-Fri). Missing or invalid: 08:30-17:00. */
export const workdayFromEnv = (env: Record<string, string | undefined> = process.env): WorkdayConfig => parseWorkday(env.DASHY_WORKDAY);
export { MemoryStore };
