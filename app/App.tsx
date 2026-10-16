import { useRef, useState } from 'react';
import { Dashy, DashyBody, NowPlayingBlock, useSpotify } from '../src/react';
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
      <Playground />
    </main>
  );
}

const DEF = {
  schema: 'dashy/avatar-definition', schemaVersion: 1,
  expressions: {
    smug: { state: 'idle', look: { cover: 0.45, lidA: -6, low: 0.2 } },
    wow: { state: 'idle', look: { eh: 88, cover: 0, sd: 4 } },
    suspicious: { state: 'idle', look: { cover: 0.5, lidA: 14, asym: 0.4 } },
  },
  sequences: {
    hello: { mode: 'once', steps: [{ expression: 'wow', holdMs: 700, transitionMs: 150, ease: 'snappy' }, { expression: 'smug', holdMs: 800, transitionMs: 300 }, { expression: 'happy', holdMs: 1000, transitionMs: 250 }] },
    moods: { mode: 'pingPong', blink: { minMs: 700, maxMs: 1400 }, steps: [{ expression: 'idle', holdMs: 900, transitionMs: 400, ease: 'smooth' }, { expression: 'suspicious', holdMs: 900, transitionMs: 300 }, { expression: 'wow', holdMs: 700, transitionMs: 150, ease: 'snappy' }, { expression: 'sad', holdMs: 900, transitionMs: 500, ease: 'smooth' }] },
  },
};
const THEMES: Record<string, { body: string; eyes: string; outline: string }> = {
  wit: { body: '#ffffff', eyes: '#101214', outline: '#c9c9c4' },
  zon: { body: '#ffe7a8', eyes: '#2a1b3d', outline: '#e0c47a' },
  munt: { body: '#c9f2dd', eyes: '#0f3b2a', outline: '#8fd1b0' },
  nacht: { body: '#232a4a', eyes: '#f2f4ff', outline: '#3b4577' },
};
const STATES: DashyState[] = ['idle', 'working', 'thinking', 'waiting', 'blocked', 'done', 'happy', 'sad', 'angry', 'strict', 'dancing', 'sleepy'];

/** Speelveld voor de nieuwe mogelijkheden: sterk aangezet zodat je het meteen ziet. */
function Playground() {
  const [state, setState] = useState<DashyState>('idle');
  const [seq, setSeq] = useState<string | undefined>();
  const [theme, setTheme] = useState('zon');
  const [strong, setStrong] = useState(true);
  const [turn, setTurn] = useState(true);
  const [shape, setShape] = useState<'square' | 'circle'>('square');
  const [url, setUrl] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const snap = async () => {
    // snapshot via the handle is internal to <Dashy />; serialise the live SVG instead (same drawing).
    const svg = host.current!.querySelector('svg')!.cloneNode(true) as SVGSVGElement;
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    setUrl(URL.createObjectURL(new Blob([svg.outerHTML], { type: 'image/svg+xml' })));
  };
  const chip = (on: boolean): React.CSSProperties => ({ padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(0,0,0,.15)', background: on ? '#17181a' : 'transparent', color: on ? '#fff' : 'inherit', cursor: 'pointer', font: 'inherit' });
  return (
    <section aria-labelledby="pg" style={{ ...card, gridColumn: '1 / -1' }}>
      <h2 id="pg" style={{ margin: 0, fontSize: '1rem' }}>Speelveld</h2>
      <div ref={host} style={{ width: 'min(60vmin,260px)' }}>
        <Dashy size="100%" state={state} shape={shape} definition={DEF} sequence={seq} colors={THEMES[theme]} ambient={strong ? 2 : false} perspective={turn ? 1.8 : false} />
      </div>
      <p style={{ margin: 0, fontSize: '.85rem', opacity: .7 }}>Beweeg je muis om hem te laten kijken.</p>
      <Row label="Toestand">{STATES.map(k => <button key={k} style={chip(!seq && state === k)} onClick={() => { setSeq(undefined); setState(k); }}>{k}</button>)}</Row>
      <Row label="Sequentie">{[['hello', 'hallo (1x)'], ['moods', 'buien (heen en weer)']].map(([k, n]) => <button key={k} style={chip(seq === k)} onClick={() => setSeq(seq === k ? undefined : k)}>{n}</button>)}</Row>
      <Row label="Kleur">{Object.keys(THEMES).map(k => <button key={k} style={chip(theme === k)} onClick={() => setTheme(k)}>{k}</button>)}</Row>
      <Row label="Vorm"><button style={chip(shape === 'square')} onClick={() => setShape('square')}>vierkant</button><button style={chip(shape === 'circle')} onClick={() => setShape('circle')}>rond</button></Row>
      <Row label="Leven"><button style={chip(strong)} onClick={() => setStrong(!strong)}>ambient {strong ? 'aan' : 'uit'}</button><button style={chip(turn)} onClick={() => setTurn(!turn)}>kopdraai {turn ? 'aan' : 'uit'}</button><button style={chip(false)} onClick={snap}>foto (SVG)</button>{url && <a href={url} download="dashy.svg">download</a>}</Row>
    </section>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '.8rem', opacity: .6, minWidth: '5rem', textAlign: 'right' }}>{label}</span>{children}</div>;
}

const card: React.CSSProperties = { display: 'grid', gap: 16, justifyItems: 'center', alignContent: 'center', padding: 'clamp(18px,3vmin,32px)', borderRadius: 28, background: 'var(--card)' };
