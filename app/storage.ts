import { adoptTasksHash, loadTasksConnection } from '../src';

/** localStorage that never throws (private mode, blocked storage). */
export const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  remove: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
/** Open the app once with #tasks=<https url>&key=<token>&act=<token>: it is remembered on this device and removed from the address bar. */
export function initialConnection() {
  const { cleaned, adopted } = adoptTasksHash(location.hash, store);
  if (adopted) history.replaceState(null, '', location.pathname + location.search + cleaned);
  return loadTasksConnection(store);
}
