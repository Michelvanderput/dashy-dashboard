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

export type Command = 'play' | 'pause' | 'next' | 'previous';
export type CommandResult = { kind: 'ok' } | { kind: 'unauthorized' } | { kind: 'premium' } | { kind: 'no-device' } | { kind: 'forbidden' } | { kind: 'rate-limited' } | { kind: 'error' };
const COMMANDS: Record<Command, { method: 'PUT' | 'POST'; path: string }> = {
  play: { method: 'PUT', path: 'play' }, pause: { method: 'PUT', path: 'pause' },
  next: { method: 'POST', path: 'next' }, previous: { method: 'POST', path: 'previous' },
};
/** One playback command (needs the user-modify-playback-state scope and, for Spotify, a Premium account). Never throws, never hangs. */
export async function sendCommand(o: { accessToken: string; command: Command; fetch?: typeof fetch; timeoutMs?: number }): Promise<CommandResult> {
  const c = COMMANDS[o.command], ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { ctl.abort(); rej(new Error('timeout')); }, o.timeoutMs ?? 8000); });
  try {
    const run = (async (): Promise<CommandResult> => {
      const res = await (o.fetch ?? fetch)(`https://api.spotify.com/v1/me/player/${c.path}`, { method: c.method, headers: { authorization: `Bearer ${o.accessToken}`, 'content-length': '0' }, signal: ctl.signal });
      if (res.ok) return { kind: 'ok' };
      if (res.status === 401) return { kind: 'unauthorized' };
      if (res.status === 429) return { kind: 'rate-limited' };
      const reason = String(((await res.json().catch(() => null)) as { error?: { reason?: string } } | null)?.error?.reason ?? '');
      if (res.status === 403) return { kind: reason === 'PREMIUM_REQUIRED' ? 'premium' : 'forbidden' };
      if (res.status === 404 || reason === 'NO_ACTIVE_DEVICE') return { kind: 'no-device' };
      return { kind: 'error' };
    })();
    run.catch(() => {});
    return await Promise.race([run, timeout]);
  } catch { return { kind: 'error' }; } finally { clearTimeout(timer); }
}
