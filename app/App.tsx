import { useEffect, useState } from 'react';
import { Clock, DayPanel, Dashy, HoursPanel, NowPlayingBlock, TaskBoard, WeatherView, useDashyTasks, useFit, useMinute, useSpotify, useWakeLock } from '../src/react';
import { briefing, burnInOffset, isKiosk, parsePlace, type DashyState } from '../src';

import { initialConnection } from './storage';

const env = import.meta.env as Record<string, string | undefined>;
/** A media query as a boolean, kept up to date (for example a low screen: a phone on its side). */
function useMediaQuery(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => { if (typeof matchMedia !== 'function') return; const m = matchMedia(query), f = () => setOn(m.matches); f(); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, [query]);
  return on;
}

const PLACE = parsePlace(env.VITE_WEATHER_PLACE); // "Maastricht:50.85,5.69"; the weather is for this place only

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
  const showMusic = !kiosk || !!nowPlaying; // a screen to look at has no use for an empty "Spotify is not connected" card

  // His mood follows your real tasks (driver rules); music only makes a calm Dashy dance.
  const [conn] = useState(initialConnection);
  const tasks = useDashyTasks({ url: conn?.url, token: conn?.token, actionUrl: conn?.actionUrl, actionToken: conn?.actionToken });
  const state: DashyState = nowPlaying?.playing && tasks.state === 'idle' ? 'dancing' : tasks.state;
  const snap = tasks.snapshot, minute = useMinute();
  // free time: after the working day and on days off the whole screen turns warmer (see the styles in index.html)
  const mode = snap?.mode ?? 'work';
  useEffect(() => { document.documentElement.dataset.mode = mode; return () => { delete document.documentElement.dataset.mode; }; }, [mode]);
  // nothing scrolls: when a block does not fit, it shows less (see useFit)
  const fitKey = `${snap?.tasks.map(t => t.id).join()}|${snap?.appointment?.at}|${!!nowPlaying}|${low}|${kiosk}`;
  const fitLeft = useFit<HTMLDivElement>(2, fitKey), fitMusic = useFit<HTMLElement>(3, fitKey);
  const fitTasks = useFit<HTMLDivElement>(4, `${fitKey}|${fitLeft.level}|${fitMusic.level}`);
  const notes = [
    ...(tasks.lastOkAt && tasks.stale && !tasks.error ? [`Niet bijgewerkt sinds ${new Date(tasks.lastOkAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`] : []),
    ...(tasks.error ? [tasks.error] : []),
  ];

  return (
    <main className={`dash${showMusic ? '' : ' nomusic'}`} style={{ padding: 'calc(clamp(12px,2.2vmin,28px) + env(safe-area-inset-top)) calc(clamp(12px,2.2vmin,28px) + env(safe-area-inset-right)) calc(clamp(12px,2.2vmin,28px) + env(safe-area-inset-bottom)) calc(clamp(12px,2.2vmin,28px) + env(safe-area-inset-left))', transform: kiosk ? `translate(${shift.x}px, ${shift.y}px)` : undefined, transition: 'transform 4s ease' }}>
      <h1 className="sr">Dashy</h1>
      <header className="dash-head">
        <Clock compact={low} />
        <WeatherView place={PLACE} compact={low} />
      </header>

      <div className="dash-left" ref={fitLeft.ref}>
        <section aria-labelledby="av" className="dash-avatar">
          <h2 id="av" className="sr">Avatar</h2>
          <div><Dashy size="100%" state={state} ambient={1.5} perspective={1.4} /></div>
        </section>
        <div className="dash-day">
          {tasks.connected && snap && fitLeft.level < 2 && <DayPanel appointment={snap.appointment} workday={snap.workday} />}
          {tasks.connected && snap && fitLeft.level < 1 && <HoursPanel hours={snap.hours} workday={snap.workday} compact={low} style={{ marginTop: low ? 8 : 12 }} />}
        </div>
      </div>

      <div className="dash-tasks" ref={fitTasks.ref}>
        {tasks.connected && snap ? (
          <TaskBoard plan={briefing(snap, minute)} tasks={snap.tasks} mode={mode} waiting={snap.waiting} leftOpen={snap.leftOpen.length} doneToday={snap.doneToday} compact={low} level={fitTasks.level} notes={notes}
            onComplete={!kiosk ? tasks.complete : undefined} justDone={!kiosk ? tasks.justDone : null} onUndo={!kiosk ? tasks.undo : undefined} />
        ) : tasks.connected ? (
          <p role="status" style={{ margin: 0, opacity: .6 }}>{tasks.error ?? 'Taken laden…'}</p>
        ) : (
          <p style={{ margin: 0, fontSize: '.9rem', opacity: .65, maxWidth: '30rem' }}>Nog niet gekoppeld aan je taken. Open de app eenmalig met <code>#tasks=https://…&amp;key=…&amp;act=…</code> achter het adres.</p>
        )}
      </div>

      {showMusic && fitMusic.level < 3 && <section aria-labelledby="mu" className="dash-music" style={card} ref={fitMusic.ref}>
        <h2 id="mu" className="sr">Muziek</h2>
        <NowPlayingBlock bare showDashy={false} nowPlaying={nowPlaying} status={spotifyId ? sp.status : 'error'} size={low || fitMusic.level === 1 ? 'min(22vmin,96px)' : fitMusic.level >= 2 ? '56px' : 'min(40vmin,180px)'}
          kiosk={kiosk} onConnect={spotifyId ? sp.connect : undefined} onDisconnect={spotifyId ? sp.disconnect : undefined} onControl={spotifyId ? sp.control : undefined} canControl={sp.canControl} needsReconnect={sp.needsReconnect} controlError={sp.controlError} error={spotifyId ? sp.error : 'Spotify is nog niet gekoppeld: zet VITE_SPOTIFY_CLIENT_ID (zie README).'} spotifyLogoSrc={env.VITE_SPOTIFY_LOGO} />
        {!kiosk && fitMusic.level < 1 && spotifyId && sp.status !== 'connected' && (
          <p style={{ margin: 0, fontSize: '.8rem', opacity: .7, textAlign: 'center', overflowWrap: 'anywhere' }}>
            Deze app stuurt Spotify terug naar <code>{redirectUri}</code>. Precies dit adres moet bij Redirect URIs in je Spotify-app staan.
          </p>
        )}
      </section>}

      <footer className="dash-foot">
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

const card: React.CSSProperties = { display: 'grid', gap: 16, justifyItems: 'center', alignContent: 'center', padding: 'clamp(18px,3vmin,32px)', borderRadius: 28, background: 'var(--card)' };
