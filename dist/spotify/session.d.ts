import { type KeyValueStore } from './auth';
import { type Command } from './client';
import { type NowPlaying } from './model';
export type SpotifyStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export interface SessionState {
    status: SpotifyStatus;
    nowPlaying: NowPlaying | null;
    error?: string; /** Why the last control did not work. Cleared by the next poll. */
    controlError?: string;
}
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
export declare const MESSAGES: {
    readonly denied: 'Je hebt Spotify geen toegang gegeven.';
    readonly login: 'Inloggen bij Spotify is niet gelukt. Probeer het opnieuw.';
    readonly forbidden: 'Dit Spotify-account heeft geen toegang tot de app. In ontwikkelmodus werkt hij voor maximaal 5 gebruikers die op de lijst staan, en de eigenaar heeft Premium nodig.';
    readonly offline: 'Spotify is niet bereikbaar. Dashy probeert het straks opnieuw.';
    readonly redirect: 'De terugkeer-URL is niet toegestaan door Spotify (https, of http://127.0.0.1, niet localhost).';
    readonly reconnect: 'Koppel Spotify opnieuw om te kunnen bedienen.';
    readonly premium: 'Bedienen werkt alleen met Spotify Premium.';
    readonly noDevice: 'Geen actief apparaat: start Spotify op een apparaat.';
    readonly controlFailed: 'Bedienen lukte niet. Probeer het zo nog eens.';
};
/**
 * Connects the pieces: login return, token refresh, polling "currently playing" at the right pace, and a small state to show.
 * No framework: the React hook (and later a Tauri or other shell) just subscribes.
 */
export declare function createSpotifySession(o: SessionOptions): {
    getState: () => SessionState;
    subscribe(fn: () => void): () => void;
    /** Handles a return from Spotify if the URL has one, otherwise resumes a saved login. */
    start(): Promise<void>;
    stop(): void;
    /** Ask again right away (e.g. when the window becomes visible). */
    nudge(): void;
    connect(): Promise<void>;
    /** Can this login control playback? False for logins made before the controls existed: they have to connect again. */
    canControl: () => boolean;
    needsReconnect: () => boolean;
    /** Previous, play, pause, next. Play and pause show at once; Spotify's answer follows within a second. Resolves to whether it worked. */
    control(cmd: Command): Promise<boolean>;
    disconnect(): void;
};
export type SpotifySession = ReturnType<typeof createSpotifySession>;
