import { useEffect, useState } from 'react';
import { DayPanel, Dashy, HoursPanel, NowPlayingBlock, useDashyTasks, useSpotify, useWakeLock } from '../src/react';
import { burnInOffset, isKiosk, nowTask, type DashyState } from '../src';

import { initialConnection } from './storage';

const env = import.meta.env as Record<string, string | undefined>;
/** Two things for now: the avatar and the music player. Everything else is rebuilt from here. */
/** A media query as a boolean, kept up to date (for example a low screen: a phone on its side). */
function useMediaQuery(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => { if (typeof matchMedia !== 'function') return; const m = matchMedia(query), f = () => setOn(m.matches); f(); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, [query]);
  return on;
}

export function App() {
  const spotifyId = env.VITE_SPOTIFY_CLIENT_ID;
  const redirectUri = env.VITE_SPOTIFY_REDIRECT_URI ?? `${location.origin}/`;
  // a screen on the charger: ?kiosk=1 shows only what is going on (no buttons), keeps the screen on, hides the mouse and moves a little now and then
  const [kiosk] = useState(() => isKiosk(location.search));
  const low = useMediaQuery('(max-height: 520px)'); // a phone on its side: everything a bit smaller
  const [awake, setAwake] = useState(() => { try { return kiosk || localStorage.getItem('dashy.awake') === '1'; } catch { return kiosk; } });
  const wake = useWakeLock(awake);
  const [shift, setShift] = useState(() => burnInOffset(Date.now()));
  useEffect(() => {
    document.documentElement.classList.toggle('kiosk', kiosk);
    if (!kiosk) return;
    const id = setInterval(() => setShift(burnInOffset(Date.now())), 30_000);
    return () => { clearInterval(id); document.documentElement.classList.remove('kiosk'); };
  }, [kiosk]);
  const toggleAwake = () => { const n = !awake; setAwake(n); try { localStorage.setItem('dashy.awake', n ? '1' : '0'); } catch { /* private mode */ } };
  const sp = useSpotify({ clientId: spotifyId ?? 'not-configured', redirectUri });
  const nowPlaying = spotifyId ? sp.nowPlaying : null;

  // His mood follows your real tasks (driver rules); music only makes a calm Dashy dance.
  const [conn] = useState(initialConnection);
  const tasks = useDashyTasks({ url: conn?.url, token: conn?.token, actionUrl: conn?.actionUrl, actionToken: conn?.actionToken });
  const state: DashyState = nowPlaying?.playing && tasks.state === 'idle' ? 'dancing' : tasks.state;
  const now = nowTask(tasks.snapshot), still = tasks.snapshot?.leftOpen.length ?? 0;
  // free time: after the working day and on days off the whole screen turns warmer (see the styles in index.html)
  const mode = tasks.snapshot?.mode ?? 'work';
  useEffect(() => { document.documentElement.dataset.mode = mode; return () => { delete document.documentElement.dataset.mode; }; }, [mode]);

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', gap: 'clamp(12px,2vmin,24px)', padding: 'calc(clamp(12px,2vmin,24px) + env(safe-area-inset-top)) calc(clamp(12px,2vmin,24px) + env(safe-area-inset-right)) calc(clamp(12px,2vmin,24px) + env(safe-area-inset-bottom)) calc(clamp(12px,2vmin,24px) + env(safe-area-inset-left))', transform: kiosk ? `translate(${shift.x}px, ${shift.y}px)` : undefined, transition: 'transform 4s ease', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,22rem),1fr))', alignContent: 'center', maxWidth: 1100, margin: '0 auto', boxSizing: 'border-box' }}>
      <h1 className="sr">Dashy</h1>
      <section aria-labelledby="av" style={{ display: 'grid', placeItems: 'center', minHeight: 0 }}>
        <h2 id="av" className="sr">Avatar</h2>
        <div style={{ width: '100%', maxWidth: low ? 'min(30rem, 30vh)' : 'min(30rem, 42vh)', minWidth: '10rem', aspectRatio: '1' }}><Dashy size="100%" state={state} ambient={1.5} perspective={1.4} /></div>
        {tasks.connected ? (
          <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: '.95rem' }}>
            {now ? <>Nu: <strong>{now.title}</strong>{now.when && <span style={{ opacity: .6 }}> · {now.when}</span>}</> : 'Niets open. Rust maar.'}
            {!kiosk && now && tasks.complete && <button type="button" onClick={() => void tasks.complete!(now.id)} style={btn}>Klaar</button>}
            {!kiosk && tasks.justDone && <span role="status" style={{ display: 'block', fontSize: '.85rem', marginTop: 8 }}>✓ {tasks.justDone.title}{tasks.undo && <> · <button type="button" onClick={() => void tasks.undo!()} style={link}>Ongedaan maken</button></>}</span>}
            {mode === 'free' && (tasks.snapshot?.waiting ?? 0) > 0 && <span style={{ display: 'block', fontSize: '.8rem', opacity: .6 }}>{tasks.snapshot!.waiting === 1 ? '1 werktaak wacht' : `${tasks.snapshot!.waiting} werktaken wachten`} tot de volgende werkdag</span>}
            {still > 0 && <span style={{ display: 'block', fontSize: '.8rem', opacity: .6 }}>{still} nog open van eerder</span>}
            {tasks.lastOkAt && tasks.stale && !tasks.error && <span role="status" style={{ display: 'block', fontSize: '.8rem', opacity: .6 }}>Niet bijgewerkt sinds {new Date(tasks.lastOkAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>}
            {tasks.error && <span role="status" style={{ display: 'block', fontSize: '.8rem', opacity: .6 }}>{tasks.error}</span>}
          </p>
        ) : (
          <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: '.8rem', opacity: .6, maxWidth: '26rem' }}>Nog niet gekoppeld aan je taken. Open de app eenmalig met <code>#tasks=https://…&amp;key=…&amp;act=…</code> achter het adres.</p>
        )}
        {tasks.connected && tasks.snapshot && <DayPanel appointment={tasks.snapshot.appointment} workday={tasks.snapshot.workday} style={{ marginTop: 16 }} />}
        {tasks.connected && tasks.snapshot && <HoursPanel hours={tasks.snapshot.hours} workday={tasks.snapshot.workday} compact={low} style={{ marginTop: low ? 8 : 12 }} />}
      </section>
      <section aria-labelledby="mu" style={card}>
        <h2 id="mu" className="sr">Muziek</h2>
        <NowPlayingBlock bare showDashy={false} nowPlaying={nowPlaying} status={spotifyId ? sp.status : 'error'} size="min(40vmin,180px)"
          kiosk={kiosk} onConnect={spotifyId ? sp.connect : undefined} onDisconnect={spotifyId ? sp.disconnect : undefined} onControl={spotifyId ? sp.control : undefined} canControl={sp.canControl} needsReconnect={sp.needsReconnect} controlError={sp.controlError} error={spotifyId ? sp.error : 'Spotify is nog niet gekoppeld: zet VITE_SPOTIFY_CLIENT_ID (zie README).'} spotifyLogoSrc={env.VITE_SPOTIFY_LOGO} />
        {!kiosk && spotifyId && sp.status !== 'connected' && (
          <p style={{ margin: 0, fontSize: '.8rem', opacity: .7, textAlign: 'center', overflowWrap: 'anywhere' }}>
            Deze app stuurt Spotify terug naar <code>{redirectUri}</code>. Precies dit adres moet bij Redirect URIs in je Spotify-app staan.
          </p>
        )}
      </section>
      <footer style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '4px 20px', justifyContent: 'center', alignItems: 'center', fontSize: '.8rem', opacity: .7 }}>
        {!kiosk && (
          <>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}><input type="checkbox" checked={awake} onChange={toggleAwake} /> Scherm aan laten</label>
            <a href="?kiosk=1" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: 'inherit' }}>Kiosk-weergave</a>
          </>
        )}
        {awake && !wake.supported && <span role="status">Deze browser kan het scherm niet aan houden: zet automatisch vergrendelen op Nooit.</span>}
        {awake && wake.error && <span role="status">{wake.error}</span>}
      </footer>
    </main>
  );
}

const btn: React.CSSProperties = { display: 'block', margin: '12px auto 0', padding: '12px 28px', minHeight: 44, borderRadius: 999, border: 0, background: 'var(--ink)', color: 'var(--bg)', font: 'inherit', fontWeight: 600, cursor: 'pointer' };
const link: React.CSSProperties = { background: 'none', border: 0, padding: 0, font: 'inherit', textDecoration: 'underline', color: 'inherit', cursor: 'pointer' };
const card: React.CSSProperties = { display: 'grid', gap: 16, justifyItems: 'center', alignContent: 'center', padding: 'clamp(18px,3vmin,32px)', borderRadius: 28, background: 'var(--card)' };
