import { MemoryStore, type Store } from './store.js';
import { type WorkdayConfig } from './plan.js';
export declare function storeFromEnv(env?: Record<string, string | undefined>): Store | null;
/** DASHY_WORKDAY="08:30-17:00": when the working day starts and ends (Mon-Fri). Missing or invalid: 08:30-17:00. */
export declare const workdayFromEnv: (env?: Record<string, string | undefined>) => WorkdayConfig;
export { MemoryStore };
