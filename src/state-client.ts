import type { DashyState } from './core';

export interface RemoteState { state: DashyState; line: string; source: 'driver' | 'claude' | 'fallback'; nextWakeAt: number | null; rev: number; /** which driver rule decided, when the server says */ rule?: string }
export interface StateClientOptions { url: string; token: string; timeoutMs?: number; fetch?: typeof fetch }

const STATES: readonly string[] = ['idle', 'received', 'working', 'thinking', 'waiting', 'blocked', 'done', 'happy', 'sad', 'angry', 'strict', 'dancing', 'sleepy'];
export const CALM: RemoteState = Object.freeze({ state: 'idle', line: '', source: 'fallback', nextWakeAt: null, rev: 0 }) as RemoteState;

/** Strict check of the state body; throws on anything unexpected. Unknown extra keys are ignored (the server may add some). */
export function parseRemoteState(raw: unknown): RemoteState {
  const v: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (typeof v !== 'object' || v === null) throw new Error('not an object');
  const o = v as Record<string, unknown>;
  if (typeof o.state !== 'string' || !STATES.includes(o.state)) throw new Error('bad state');
  if (typeof o.line !== 'string' || o.line.length > 100) throw new Error('bad line');
  if (o.source !== 'driver' && o.source !== 'claude' && o.source !== 'fallback') throw new Error('bad source');
  const wake = o.nextWakeAt;
  if (wake !== null && (typeof wake !== 'number' || !Number.isFinite(wake))) throw new Error('bad wake');
  return { state: o.state as DashyState, line: o.line, source: o.source, nextWakeAt: wake as number | null, rev: typeof o.rev === 'number' ? o.rev : 0, ...(typeof o.rule === 'string' && o.rule.length < 30 ? { rule: o.rule } : {}) };
}

/** Never throws, never hangs: any error, timeout, bad status or invalid body gives the calm fallback (idle, no text). */
export async function fetchDashyState(o: StateClientOptions): Promise<RemoteState> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { ctl.abort(); reject(new Error('timeout')); }, o.timeoutMs ?? 8000); });
  try {
    const request = (async () => {
      const res = await (o.fetch ?? fetch)(o.url, { method: 'GET', headers: { authorization: `Bearer ${o.token}` }, signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return parseRemoteState(await res.text());
    })();
    request.catch(() => {});
    return await Promise.race([request, timeout]);
  } catch { return { ...CALM }; } finally { clearTimeout(timer); }
}
