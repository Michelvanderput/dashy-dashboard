import { useState } from 'react';
import { DashyBody, NowPlayingBlock, useSpotify } from '../src/react';
import { ALL_STATES, type DashyState } from '../src';
import { demoTrack } from './demo';
import { useNow } from './useNow';

const env = import.meta.env as Record<string, string | undefined>;
const LABEL: Record<DashyState, string> = {
  idle: 'Rustig', received: 'Ontvangen', working: 'Aan het werk', thinking: 'Denkt na', waiting: 'Wacht', blocked: 'Zit vast', done: 'Klaar',
  happy: 'Blij', sad: 'Sip', angry: 'Boos', strict: 'Streng', dancing: 'Danst', sleepy: 'Slaperig',
};

/** Two things for now: the avatar and the music player. Everything else is rebuilt from here. */
export function App() {
  const now = useNow(1000);
  const [state, setState] = useState<DashyState>('idle');
  const [demoPlaying, setDemoPlaying] = useState(false), [track, setTrack] = useState(0);
  const spotifyId = env.VITE_SPOTIFY_CLIENT_ID;
  const sp = useSpotify({ clientId: spotifyId ?? 'not-configured', redirectUri: env.VITE_SPOTIFY_REDIRECT_URI ?? `${location.origin}/` });
  const nowPlaying = spotifyId ? sp.nowPlaying : demoPlaying ? demoTrack(now, true, track) : null;

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', gap: 'clamp(12px,2vmin,24px)', padding: 'clamp(12px,2vmin,24px)', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,22rem),1fr))', alignContent: 'center', maxWidth: 1100, margin: '0 auto', boxSizing: 'border-box' }}>
      <h1 className="sr">Dashy</h1>
      <section aria-labelledby="av" style={card}>
        <h2 id="av" className="sr">Avatar</h2>
        <div style={{ width: 'min(100%,26rem)', aspectRatio: '1' }}><DashyBody state={state} /></div>
        <div role="group" aria-label="Stemming van Dashy" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {ALL_STATES.map(s => <button key={s} type="button" aria-pressed={s === state} onClick={() => setState(s)} style={chip(s === state)}>{LABEL[s]}</button>)}
        </div>
      </section>
      <section aria-labelledby="mu" style={card}>
        <h2 id="mu" className="sr">Muziek</h2>
        <NowPlayingBlock bare nowPlaying={nowPlaying} status={spotifyId ? sp.status : 'connected'} size="min(40vmin,180px)"
          onConnect={spotifyId ? sp.connect : undefined} onDisconnect={spotifyId ? sp.disconnect : undefined} error={sp.error} spotifyLogoSrc={env.VITE_SPOTIFY_LOGO} />
        {!spotifyId && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" aria-pressed={demoPlaying} onClick={() => setDemoPlaying(v => !v)} style={chip(demoPlaying)}>{demoPlaying ? 'Demo: stop' : 'Demo: speel'}</button>
            <button type="button" onClick={() => { setTrack(t => t + 1); setDemoPlaying(true); }} style={chip(false)}>Volgend nummer</button>
          </div>
        )}
      </section>
    </main>
  );
}

const card: React.CSSProperties = { display: 'grid', gap: 16, justifyItems: 'center', alignContent: 'center', padding: 'clamp(18px,3vmin,32px)', borderRadius: 28, background: 'var(--card)' };
const chip = (on: boolean): React.CSSProperties => ({ minHeight: 44, padding: '0 14px', borderRadius: 999, border: '1px solid var(--line)', background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--card)' : 'var(--ink)', font: 'inherit', cursor: 'pointer' });
