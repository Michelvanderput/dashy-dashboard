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
/** Cover: the smallest image that is at least 300 px wide (enough for the block, small download), else the largest. */
export declare function pickCover(images: unknown): string | null;
/**
 * Parses GET /v1/me/player/currently-playing. Returns null for "nothing to show": no body, ads, podcasts/episodes,
 * or anything that does not look like a track. Never throws.
 */
export declare function parseCurrentlyPlaying(json: unknown, fetchedAt: number): NowPlaying | null;
/** Where the track is now, interpolated from the last answer (only moves while playing). */
export declare function progressAt(np: NowPlaying, now: number): number;
export type PollResult = {
    kind: 'playing';
    np: NowPlaying;
} | {
    kind: 'nothing';
} | {
    kind: 'unauthorized';
} | {
    kind: 'forbidden';
} | {
    kind: 'rate-limited';
    retryAfterMs: number;
} | {
    kind: 'error';
};
export declare const POLL: {
    readonly playingMs: 5000;
    readonly idleMs: 10000;
    readonly minMs: 1000;
    readonly maxBackoffMs: 60000;
    readonly maxRetryAfterMs: 120000;
};
/**
 * How long to wait before asking again. While playing: 5 s, but sooner near the end of the track so a track change
 * shows quickly. Nothing playing: 10 s. Rate limited: what Spotify says. Errors: backoff doubling up to a minute.
 */
export declare function nextPollDelay(result: PollResult, now: number, consecutiveErrors?: number): number;
/**
 * Dashy dances while music plays, but facts beat feelings (same as Claude's mood): only when the state driver has
 * nothing urgent. A deadline, blocked, waiting, a break or a celebration keeps its own state.
 */
export declare function musicState(driver: Resolution, playing: boolean): DashyState;
/** A stable vinyl colour per album (no image analysis, no cross-origin pixels): the same album always gets the same record. */
export declare const VINYL_COLORS: readonly ['#c8102e', '#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#111111', '#be185d', '#4d7c0f'];
export declare function vinylColor(seed: string): string;
