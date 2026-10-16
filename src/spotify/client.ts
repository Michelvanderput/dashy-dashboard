import { parseCurrentlyPlaying, type PollResult } from './model';

const URL_ = 'https://api.spotify.com/v1/me/player/currently-playing';

/** One call to "currently playing". Never throws and never hangs; every outcome is a PollResult. */
export async function fetchCurrentlyPlaying(o: { accessToken: string; fetch?: typeof fetch; now?: () => number; timeoutMs?: number }): Promise<PollResult> {
  const now = o.now ?? Date.now, ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { ctl.abort(); rej(new Error('timeout')); }, o.timeoutMs ?? 8000); });
  try {
    const run = (async (): Promise<PollResult> => {
      const res = await (o.fetch ?? fetch)(URL_, { headers: { authorization: `Bearer ${o.accessToken}` }, signal: ctl.signal });
      if (res.status === 204) return { kind: 'nothing' };
      if (res.status === 401) return { kind: 'unauthorized' };
      if (res.status === 403) return { kind: 'forbidden' };
      if (res.status === 429) { const s = Number(res.headers.get('retry-after')); return { kind: 'rate-limited', retryAfterMs: Number.isFinite(s) && s > 0 ? s * 1000 : 5000 }; }
      if (!res.ok) return { kind: 'error' };
      const np = parseCurrentlyPlaying(await res.json().catch(() => null), now());
      return np ? { kind: 'playing', np } : { kind: 'nothing' };
    })();
    run.catch(() => {});
    return await Promise.race([run, timeout]);
  } catch { return { kind: 'error' }; } finally { clearTimeout(timer); }
}
