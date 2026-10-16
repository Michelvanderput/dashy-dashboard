import { useState } from 'react';
import { Dashy, NowPlayingBlock, useDashyTasks, useSpotify } from '../src/react';
import { adoptTasksHash, loadTasksConnection, nowTask, type DashyState } from '../src';

const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } }, remove: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } } };
/** Open the app once with #tasks=<https url>&key=<token>: it is remembered on this device and removed from the address bar. */
function initialConnection() {
  const { cleaned, adopted } = adoptTasksHash(location.hash, store);
  if (adopted) history.replaceState(null, '', location.pathname + location.search + cleaned);
  return loadTasksConnection(store);
}

const env = import.meta.env as Record<string, string | undefined>;
/** Two things for now: the avatar and the music player. Everything else is rebuilt from here. */
export function App() {
  const spotifyId = env.VITE_SPOTIFY_CLIENT_ID;
  const redirectUri = env.VITE_SPOTIFY_REDIRECT_URI ?? `${location.origin}/`;
  const sp = useSpotify({ clientId: spotifyId ?? 'not-configured', redirectUri });
  const nowPlaying = spotifyId ? sp.nowPlaying : null;

  // His mood follows your real tasks (driver rules); music only makes a calm Dashy dance.
  const [conn] = useState(initialConnection);
  const tasks = useDashyTasks({ url: conn?.url, token: conn?.token, actionUrl: conn?.actionUrl, actionToken: conn?.actionToken });
  const state: DashyState = nowPlaying?.playing && tasks.state === 'idle' ? 'dancing' : tasks.state;
  const now = nowTask(tasks.snapshot), still = tasks.snapshot?.leftOpen.length ?? 0;

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', gap: 'clamp(12px,2vmin,24px)', padding: 'clamp(12px,2vmin,24px)', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,22rem),1fr))', alignContent: 'center', maxWidth: 1100, margin: '0 auto', boxSizing: 'border-box' }}>
      <h1 className="sr">Dashy</h1>
      <section aria-labelledby="av" style={{ display: 'grid', placeItems: 'center', minHeight: 0 }}>
        <h2 id="av" className="sr">Avatar</h2>
        <div style={{ width: '100%', maxWidth: '30rem', aspectRatio: '1' }}><Dashy size="100%" state={state} ambient={1.5} perspective={1.4} /></div>
        {tasks.connected ? (
          <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: '.95rem' }}>
            {now ? <>Nu: <strong>{now.title}</strong>{now.when && <span style={{ opacity: .6 }}> · {now.when}</span>}</> : 'Niets open. Rust maar.'}
            {now && tasks.complete && <button type="button" onClick={() => void tasks.complete!(now.id)} style={btn}>Klaar</button>}
            {tasks.justDone && <span role="status" style={{ display: 'block', fontSize: '.85rem', marginTop: 8 }}>✓ {tasks.justDone.title}{tasks.undo && <> · <button type="button" onClick={() => void tasks.undo!()} style={link}>Ongedaan maken</button></>}</span>}
            {still > 0 && <span style={{ display: 'block', fontSize: '.8rem', opacity: .6 }}>{still} nog open van eerder</span>}
            {tasks.lastOkAt && tasks.stale && !tasks.error && <span role="status" style={{ display: 'block', fontSize: '.8rem', opacity: .6 }}>Niet bijgewerkt sinds {new Date(tasks.lastOkAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>}
            {tasks.error && <span role="status" style={{ display: 'block', fontSize: '.8rem', opacity: .6 }}>{tasks.error}</span>}
          </p>
        ) : (
          <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: '.8rem', opacity: .6, maxWidth: '26rem' }}>Nog niet gekoppeld aan je taken. Open de app eenmalig met <code>#tasks=https://…&amp;key=…&amp;act=…</code> achter het adres.</p>
        )}
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

const btn: React.CSSProperties = { display: 'block', margin: '12px auto 0', padding: '12px 28px', minHeight: 44, borderRadius: 999, border: 0, background: 'var(--ink)', color: 'var(--bg)', font: 'inherit', fontWeight: 600, cursor: 'pointer' };
const link: React.CSSProperties = { background: 'none', border: 0, padding: 0, font: 'inherit', textDecoration: 'underline', color: 'inherit', cursor: 'pointer' };
const card: React.CSSProperties = { display: 'grid', gap: 16, justifyItems: 'center', alignContent: 'center', padding: 'clamp(18px,3vmin,32px)', borderRadius: 28, background: 'var(--card)' };
