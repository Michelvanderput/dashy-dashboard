/**
 * Spotify "now playing": strict parsing of the Web API answer, progress interpolation, polling plan, and the rule
 * for when Dashy dances. Pure: no network, no clock (time is passed in).
 */
import type { DashyState } from '../core';
import type { Resolution } from '../driver';

export interface NowPlaying {
  id: string;
  title: string;
  artists: string[];
  album: string;
  /** https URL of the album cover, or null */
  coverUrl: string | null;
  /** https://open.spotify.com/... link to the track, or null */
  trackUrl: string | null;
  durationMs: number;
  /** progress at `fetchedAt` */
  progressMs: number;
  playing: boolean;
  /** local time (ms epoch) the answer was received */
  fetchedAt: number;
}

const isHttps = (u: unknown): u is string => { try { return typeof u === 'string' && new URL(u).protocol === 'https:'; } catch { return false; } };
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Cover: the smallest image that is at least 300 px wide (enough for the block, small download), else the largest. */
export function pickCover(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const list = images.filter((i): i is { url: string; width?: number } => !!i && typeof i === 'object' && isHttps((i as { url?: unknown }).url))
    .map(i => ({ url: i.url, w: typeof i.width === 'number' ? i.width : 0 }));
  if (!list.length) return null;
  const big = list.filter(i => i.w >= 300).sort((a, b) => a.w - b.w);
  return (big[0] ?? list.sort((a, b) => b.w - a.w)[0]).url;
}

/**
 * Parses GET /v1/me/player/currently-playing. Returns null for "nothing to show": no body, ads, podcasts/episodes,
 * or anything that does not look like a track. Never throws.
 */
export function parseCurrentlyPlaying(json: unknown, fetchedAt: number): NowPlaying | null {
  try {
    if (typeof json !== 'object' || json === null) return null;
    const j = json as Record<string, any>;
    if (j.currently_playing_type !== 'track') return null;
    const item = j.item;
    if (typeof item !== 'object' || item === null || item.type === 'episode') return null;
    const title = text(item.name, 120);
    const duration = item.duration_ms;
    if (!title || typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return null;
    const progress = typeof j.progress_ms === 'number' && Number.isFinite(j.progress_ms) ? Math.min(Math.max(0, j.progress_ms), duration) : 0;
    return {
      id: text(item.id ?? item.uri ?? title, 80),
      title,
      artists: Array.isArray(item.artists) ? item.artists.map((a: any) => text(a?.name, 80)).filter(Boolean).slice(0, 6) : [],
      album: text(item.album?.name, 120),
      coverUrl: pickCover(item.album?.images),
      trackUrl: isHttps(item.external_urls?.spotify) && new URL(item.external_urls.spotify).hostname.endsWith('spotify.com') ? item.external_urls.spotify : null,
      durationMs: duration,
      progressMs: progress,
      playing: j.is_playing === true,
      fetchedAt,
    };
  } catch { return null; }
}

/** Where the track is now, interpolated from the last answer (only moves while playing). */
export function progressAt(np: NowPlaying, now: number): number {
  return Math.min(np.durationMs, Math.max(0, np.progressMs + (np.playing ? now - np.fetchedAt : 0)));
}

export type PollResult =
  | { kind: 'playing'; np: NowPlaying }
  | { kind: 'nothing' }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'rate-limited'; retryAfterMs: number }
  | { kind: 'error' };

export const POLL = { playingMs: 5000, idleMs: 10_000, minMs: 1000, maxBackoffMs: 60_000, maxRetryAfterMs: 120_000 } as const;

/**
 * How long to wait before asking again. While playing: 5 s, but sooner near the end of the track so a track change
 * shows quickly. Nothing playing: 10 s. Rate limited: what Spotify says. Errors: backoff doubling up to a minute.
 */
export function nextPollDelay(result: PollResult, now: number, consecutiveErrors = 0): number {
  switch (result.kind) {
    case 'playing': {
      if (!result.np.playing) return POLL.idleMs;
      const left = result.np.durationMs - progressAt(result.np, now);
      return Math.max(POLL.minMs, Math.min(POLL.playingMs, left + 400));
    }
    case 'nothing': return POLL.idleMs;
    case 'rate-limited': return Math.min(POLL.maxRetryAfterMs, Math.max(POLL.minMs, result.retryAfterMs));
    case 'unauthorized': case 'forbidden': case 'error':
      return Math.min(POLL.maxBackoffMs, POLL.idleMs * 2 ** Math.min(consecutiveErrors, 3));
  }
}

/**
 * Dashy dances while music plays, but facts beat feelings (same as Claude's mood): only when the state driver has
 * nothing urgent. A deadline, blocked, waiting, a break or a celebration keeps its own state.
 */
export function musicState(driver: Resolution, playing: boolean): DashyState {
  return playing && (driver.rule === 'idle' || driver.rule === 'quiet' || driver.rule === 'working') ? 'dancing' : driver.state;
}

/** A stable vinyl colour per album (no image analysis, no cross-origin pixels): the same album always gets the same record. */
export const VINYL_COLORS = ['#c8102e', '#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#111111', '#be185d', '#4d7c0f'] as const;
export function vinylColor(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return VINYL_COLORS[(h >>> 0) % VINYL_COLORS.length];
}
