import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createSpotifySession, type SessionOptions, type SessionState } from '../spotify/session';

export interface UseSpotifyOptions extends Pick<SessionOptions, 'clientId' | 'redirectUri'> { session?: ReturnType<typeof createSpotifySession> }

/**
 * Spotify connection for React: { status, nowPlaying, error, connect, disconnect }.
 * Pass the result straight to <NowPlayingBlock />. Handles the return from Spotify, token refresh and polling.
 */
export function useSpotify(o: UseSpotifyOptions): SessionState & { connect: () => void; disconnect: () => void } {
  const session = useMemo(() => o.session ?? createSpotifySession({
    clientId: o.clientId, redirectUri: o.redirectUri,
    currentUrl: () => location.href, replaceUrl: u => history.replaceState(null, '', u),
  }), [o.session, o.clientId, o.redirectUri]);
  const s = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  useEffect(() => {
    void session.start();
    const onVisible = () => { if (!document.hidden) session.nudge(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); session.stop(); };
  }, [session]);
  return { ...s, connect: () => { void session.connect(); }, disconnect: () => session.disconnect() };
}
