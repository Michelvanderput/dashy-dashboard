import { createSpotifySession, type SessionOptions, type SessionState } from '../spotify/session';
export interface UseSpotifyOptions extends Pick<SessionOptions, 'clientId' | 'redirectUri'> {
    session?: ReturnType<typeof createSpotifySession>;
}
/**
 * Spotify connection for React: { status, nowPlaying, error, connect, disconnect }.
 * Pass the result straight to <NowPlayingBlock />. Handles the return from Spotify, token refresh and polling.
 */
export declare function useSpotify(o: UseSpotifyOptions): SessionState & {
    connect: () => void;
    disconnect: () => void;
};
