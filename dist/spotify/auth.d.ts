/**
 * Spotify Authorization Code flow with PKCE: no client secret, so it is safe to run inside a web or desktop app.
 * Everything that touches the outside (storage, network, navigation, time) is passed in, so it can be tested.
 */
export declare const CONTROL_SCOPE = "user-modify-playback-state";
export declare const SCOPES: readonly ['user-read-currently-playing', "user-modify-playback-state"];
export interface TokenSet {
    accessToken: string;
    refreshToken: string; /** ms epoch */
    expiresAt: number; /** scopes Spotify granted (space separated). Missing on tokens saved before controls existed. */
    scope?: string;
}
/** Did the login include this scope? Old saved logins did not, so they have to log in again to get the controls. */
export declare const hasScope: (t: Pick<TokenSet, 'scope'> | null, scope: string) => boolean;
export interface KeyValueStore {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
}
export declare class AuthError extends Error {
    readonly reason: 'denied' | 'state' | 'expired' | 'exchange' | 'redirect';
    constructor(reason: 'denied' | 'state' | 'expired' | 'exchange' | 'redirect', message: string);
}
/** Spotify accepts https, or http on a loopback IP literal. `localhost` is rejected. */
export declare function checkRedirectUri(uri: string): void;
/** `length` characters (43-128 for a verifier) from the unreserved set, without modulo bias. */
export declare function randomString(length?: number, getRandomValues?: (a: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>): string;
export declare const base64url: (buf: ArrayBuffer) => string;
export declare function challengeFor(verifier: string): Promise<string>;
export declare function buildAuthorizeUrl(o: {
    clientId: string;
    redirectUri: string;
    state: string;
    challenge: string;
    scopes?: readonly string[];
}): string;
export declare function beginLogin(o: {
    clientId: string;
    redirectUri: string;
    pending: KeyValueStore;
    navigate: (url: string) => void;
}): Promise<void>;
/** Call with the URL Spotify redirected back to. Throws AuthError (never leaks codes or tokens into the message). */
export declare function completeLogin(o: {
    clientId: string;
    callbackUrl: string;
    pending: KeyValueStore;
    fetch: typeof fetch;
    now: number;
}): Promise<TokenSet>;
export declare function refreshTokens(o: {
    clientId: string;
    refreshToken: string;
    fetch: typeof fetch;
    now: number;
}): Promise<TokenSet>;
export declare function loadTokens(s: KeyValueStore): TokenSet | null;
export declare const saveTokens: (s: KeyValueStore, t: TokenSet) => void;
export declare const clearTokens: (s: KeyValueStore) => void;
/** localStorage/sessionStorage wrapped so a blocked or missing storage never throws. */
export declare function webStore(kind: 'local' | 'session'): KeyValueStore;
