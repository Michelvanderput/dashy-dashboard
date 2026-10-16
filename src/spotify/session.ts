import { AuthError, beginLogin, clearTokens, completeLogin, loadTokens, refreshTokens, saveTokens, webStore, type KeyValueStore, type TokenSet } from './auth';
import { fetchCurrentlyPlaying } from './client';
import { nextPollDelay, type NowPlaying, type PollResult } from './model';

export type SpotifyStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export interface SessionState { status: SpotifyStatus; nowPlaying: NowPlaying | null; error?: string }

export interface SessionOptions {
  clientId: string;
  /** Must be registered in the Spotify dashboard: https://..., or http://127.0.0.1:PORT/... (not localhost). */
  redirectUri: string;
  tokens?: KeyValueStore;
  pending?: KeyValueStore;
  fetch?: typeof fetch;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
  navigate?: (url: string) => void;
  /** The current page URL (to detect the return from Spotify). */
  currentUrl?: () => string;
  /** Called after the callback was handled, to remove ?code=... from the address bar. */
  replaceUrl?: (url: string) => void;
  /** false while the window is hidden: polling then pauses. */
  isVisible?: () => boolean;
}

export const MESSAGES = {
  denied: 'Je hebt Spotify geen toegang gegeven.',
  login: 'Inloggen bij Spotify is niet gelukt. Probeer het opnieuw.',
  forbidden: 'Dit Spotify-account heeft geen toegang tot de app. In ontwikkelmodus werkt hij voor maximaal 5 gebruikers die op de lijst staan, en de eigenaar heeft Premium nodig.',
  offline: 'Spotify is niet bereikbaar. Dashy probeert het straks opnieuw.',
  redirect: 'De terugkeer-URL is niet toegestaan door Spotify (https, of http://127.0.0.1, niet localhost).',
} as const;

/**
 * Connects the pieces: login return, token refresh, polling "currently playing" at the right pace, and a small state to show.
 * No framework: the React hook (and later a Tauri or other shell) just subscribes.
 */
export function createSpotifySession(o: SessionOptions) {
  const tokens = o.tokens ?? webStore('local'), pending = o.pending ?? webStore('session');
  const f = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = o.now ?? Date.now;
  const setT = o.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = o.clearTimeout ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const visible = o.isVisible ?? (() => typeof document === 'undefined' || !document.hidden);

  let state: SessionState = { status: 'disconnected', nowPlaying: null };
  const subs = new Set<() => void>();
  let callback: Promise<void> | null = null, timer: unknown, running = false, inFlight = false, errors = 0, tok: TokenSet | null = null, refreshing: Promise<TokenSet | null> | null = null;

  const set = (s: SessionState) => { state = s; subs.forEach(fn => fn()); };
  const schedule = (ms: number) => { clearT(timer); if (running) timer = setT(() => { void poll(); }, ms); };

  /** One refresh at a time. Returns null when the grant is gone (user must log in again). */
  function refresh(): Promise<TokenSet | null> {
    return refreshing ??= (async () => {
      try {
        const t = await refreshTokens({ clientId: o.clientId, refreshToken: tok!.refreshToken, fetch: f, now: now() });
        tok = t; saveTokens(tokens, t); return t;
      } catch (e) {
        if (e instanceof AuthError && e.reason === 'expired') { clearTokens(tokens); tok = null; return null; }
        throw e; // network trouble: keep the token, try again later
      } finally { refreshing = null; }
    })();
  }

  async function poll(): Promise<void> {
    if (!running || inFlight || !tok) return;
    if (!visible()) { schedule(5000); return; }
    inFlight = true;
    try {
      if (tok.expiresAt - now() < 60_000) {
        const t = await refresh();
        if (!t) { if (running) set({ status: 'disconnected', nowPlaying: null }); return; }
      }
      let r: PollResult = await fetchCurrentlyPlaying({ accessToken: tok!.accessToken, fetch: f, now });
      if (r.kind === 'unauthorized') {
        const t = await refresh();
        if (!t) { if (running) set({ status: 'disconnected', nowPlaying: null }); return; }
        r = await fetchCurrentlyPlaying({ accessToken: t.accessToken, fetch: f, now });
      }
      if (!running) return;
      if (r.kind === 'playing' || r.kind === 'nothing') { errors = 0; set({ status: 'connected', nowPlaying: r.kind === 'playing' ? r.np : null }); }
      else if (r.kind === 'rate-limited') { set({ ...state, status: state.nowPlaying ? 'connected' : 'connecting' }); }
      else { errors++; set({ status: 'error', nowPlaying: null, error: r.kind === 'forbidden' ? MESSAGES.forbidden : MESSAGES.offline }); }
      schedule(nextPollDelay(r, now(), Math.max(0, errors - 1))); // first error waits 10 s, then 20, 40, 60
    } catch {
      errors++; if (running) { set({ status: 'error', nowPlaying: null, error: MESSAGES.offline }); schedule(nextPollDelay({ kind: 'error' }, now(), Math.max(0, errors - 1))); }
    } finally { inFlight = false; }
  }

  return {
    getState: () => state,
    subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },

    /** Handles a return from Spotify if the URL has one, otherwise resumes a saved login. */
    async start(): Promise<void> {
      running = true;
      const url = o.currentUrl?.();
      const u = url ? new URL(url) : null;
      if (u && (u.searchParams.has('code') || u.searchParams.has('error')) && u.searchParams.has('state')) {
        // The return from Spotify is handled exactly once per session, even when start() runs twice (React StrictMode runs
        // effects twice in development): the code is single use, so a second attempt would fail and show a false error.
        callback ??= (async () => {
          set({ status: 'connecting', nowPlaying: null });
          try {
            tok = await completeLogin({ clientId: o.clientId, callbackUrl: url!, pending, fetch: f, now: now() });
            saveTokens(tokens, tok);
          } catch (e) {
            tok = null;
            const reason = e instanceof AuthError ? e.reason : 'exchange';
            set({ status: 'error', nowPlaying: null, error: reason === 'denied' ? MESSAGES.denied : MESSAGES.login });
          }
          for (const k of ['code', 'state', 'error']) u.searchParams.delete(k);
          o.replaceUrl?.(u.toString());
        })();
        await callback;
        if (!tok) return;
      } else {
        tok = loadTokens(tokens);
        if (!tok) { set({ status: 'disconnected', nowPlaying: null }); return; }
        set({ status: 'connecting', nowPlaying: null });
      }
      await poll();
    },
    stop() { running = false; clearT(timer); },
    /** Ask again right away (e.g. when the window becomes visible). */
    nudge() { if (running && tok) { clearT(timer); void poll(); } },

    async connect(): Promise<void> {
      try {
        await beginLogin({ clientId: o.clientId, redirectUri: o.redirectUri, pending, navigate: o.navigate ?? (url => { location.assign(url); }) });
      } catch (e) {
        set({ status: 'error', nowPlaying: null, error: e instanceof AuthError && e.reason === 'redirect' ? MESSAGES.redirect : MESSAGES.login });
      }
    },
    disconnect() { clearTokens(tokens); tok = null; clearT(timer); errors = 0; set({ status: 'disconnected', nowPlaying: null }); },
  };
}
export type SpotifySession = ReturnType<typeof createSpotifySession>;
