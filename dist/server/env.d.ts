import { MemoryStore, type Store } from './store.js';
export declare function storeFromEnv(env?: Record<string, string | undefined>): Store | null;
export { MemoryStore };
