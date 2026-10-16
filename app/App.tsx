import { DashyBody, NowPlayingBlock, useSpotify } from '../src/react';
import type { DashyState } from '../src';

const env = import.meta.env as Record<string, string | undefined>;
/** Two things for now: the avatar and the music player. Everything else is rebuilt from here. */
export function App() {
  const spotifyId = env.VITE_SPOTIFY_CLIENT_ID;
  const redirectUri = env.VITE_SPOTIFY_REDIRECT_URI ?? `${location.origin}/`;
  const sp = useSpotify({ clientId: spotifyId ?? 'not-configured', redirectUri });
  const nowPlaying = spotifyId ? sp.nowPlaying : null;

  // Dashy dances while music plays, otherwise he is calm.
  const state: DashyState = nowPlaying?.playing ? 'dancing' : 'idle';

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', gap: 'clamp(12px,2vmin,24px)', padding: 'clamp(12px,2vmin,24px)', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,22rem),1fr))', alignContent: 'center', maxWidth: 1100, margin: '0 auto', boxSizing: 'border-box' }}>
      <h1 className="sr">Dashy</h1>
      <section aria-labelledby="av" style={{ display: 'grid', placeItems: 'center', minHeight: 0 }}>
        <h2 id="av" className="sr">Avatar</h2>
        <div style={{ width: '100%', maxWidth: '30rem', aspectRatio: '1' }}><DashyBody state={state} /></div>
      </section>
      <section aria-labelledby="mu" style={card}>
        <h2 id="mu" className="sr">Muziek</h2>
        <NowPlayingBlock bare showDashy={false} nowPlaying={nowPlaying} status={spotifyId ? sp.status : 'error'} size="min(40vmin,180px)"
          onConnect={spotifyId ? sp.connect : undefined} onDisconnect={spotifyId ? sp.disconnect : undefined} error={spotifyId ? sp.error : 'Spotify is nog niet gekoppeld: zet VITE_SPOTIFY_CLIENT_ID (zie README).'} spotifyLogoSrc={env.VITE_SPOTIFY_LOGO} />
        {spotifyId && sp.status !== 'connected' && (
          <p style={{ margin: 0, fontSize: '.8rem', opacity: .7, textAlign: 'center', overflowWrap: 'anywhere' }}>
            Deze app stuurt Spotify terug naar <code>{redirectUri}</code>. Precies dit adres moet bij Redirect URIs in je Spotify-app staan.
          </p>
        )}
      </section>
    </main>
  );
}

const card: React.CSSProperties = { display: 'grid', gap: 16, justifyItems: 'center', alignContent: 'center', padding: 'clamp(18px,3vmin,32px)', borderRadius: 28, background: 'var(--card)' };
