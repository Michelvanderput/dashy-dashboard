import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import type { DashyState } from '../core';
import { initialDriverState, resolve, type Resolution } from '../driver';
import { musicState, progressAt, vinylColor, type NowPlaying } from '../spotify/model';
import type { SpotifyStatus } from '../spotify/session';
import { Dashy } from './Dashy';



export interface NowPlayingBlockProps {
  /**
   * URL of the official Spotify logo (full logo, icon + wordmark, at least 70 px wide). Spotify requires its logo next to
   * its metadata and cover art. Download it from Spotify's design guidelines; it is not drawn here on purpose.
   */
  spotifyLogoSrc?: string;
  nowPlaying: NowPlaying | null;
  status: SpotifyStatus;
  onConnect?: () => void;
  onDisconnect?: () => void;
  /** What the state driver says right now. Dashy dances to the music only when this is calm (idle, quiet, working). Default: idle. */
  driver?: Resolution;
  /** Size of the album cover: px (number) or any CSS length. Default 160. */
  size?: number | string;
  /** No card of its own (background, padding, corners): for use inside another container. */
  bare?: boolean;
  /** Show Dashy dancing next to the record. Default true. Turn off when Dashy lives in a block of his own. */
  showDashy?: boolean;
  /** Message to show with status "error". */
  error?: string;
  className?: string;
  style?: CSSProperties;
}

const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const CALM: Resolution = resolve(initialDriverState(0), 0);

const CSS = `
.dnp{--s:160px;--vinyl:#c8102e;container-type:inline-size;position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:20px 28px;padding:20px 24px;border-radius:20px;
 background:color-mix(in srgb,var(--vinyl) 9%,#f6f5f1);color:#16181a;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
@media (prefers-color-scheme:dark){.dnp{background:color-mix(in srgb,var(--vinyl) 16%,#17181a);color:#f1f0ec}}
.dnp-bare{padding:0;border-radius:0;background:none;overflow:visible;gap:12px 24px;font-family:inherit}
.dnp-bare .dnp-title{font-size:clamp(1.1em,4.4cqw,1.75em);font-weight:550;letter-spacing:-.02em;line-height:1.2;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.dnp-bare .dnp-artist{font-size:clamp(.92em,3.2cqw,1.2em);overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden}
.dnp-bare .dnp-note{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.dnp-bare .dnp-bar{height:4px;margin-top:16px;border-radius:4px}
.dnp-bare .dnp-bar>i{background:currentColor;opacity:.7}
.dnp-bare .dnp-time{font-size:.9em;opacity:.75}
.dnp-bare .dnp-btn{margin-left:auto;border:0;padding:0 2px;min-height:44px;opacity:.7;text-decoration:underline;text-underline-offset:4px;text-decoration-color:rgba(127,127,127,.5)}
.dnp-bare .dnp-btn:hover{background:none;opacity:1}
.dnp-bare .dnp-link{font-size:.82em;letter-spacing:.05em;opacity:.8}
.dnp-stage{position:relative;flex:none;width:calc(var(--s)*1.72);height:var(--s)}
.dnp-sleeve{position:absolute;left:0;top:0;width:var(--s);height:var(--s);z-index:2;background:#fff;border-radius:var(--rc,4px);overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.18),0 14px 24px -16px rgba(0,0,0,.4)}
.dnp-sleeve img{display:block;width:100%;height:100%;object-fit:contain}
.dnp-blank{display:grid;place-items:center;width:100%;height:100%;background:#e4e2db;color:#7d7c73}
.dnp-vinyl{position:absolute;left:0;top:calc(var(--s)*.03);width:calc(var(--s)*.94);height:calc(var(--s)*.94);z-index:1;transform:translateX(var(--out,20%));transition:transform .7s cubic-bezier(.3,.9,.3,1)}
.dnp[data-playing="true"]{--out:80%}.dnp[data-paused="true"]{--out:62%}
.dnp-disc{position:relative;width:100%;height:100%;border-radius:50%;background:var(--vinyl);box-shadow:0 10px 20px -12px rgba(0,0,0,.45)}
.dnp-spin{position:absolute;inset:0;border-radius:50%;animation:dnp-rot 1.8s linear infinite;animation-play-state:paused}
.dnp[data-playing="true"] .dnp-spin{animation-play-state:running}
.dnp[data-playing="true"] .dnp-spin{will-change:transform}
.dnp[data-paused="true"] .dnp-disc{filter:saturate(.55) brightness(.92)}
.dnp-pill{display:inline-block;margin-top:8px;padding:2px 10px;border-radius:999px;font-size:.78em;letter-spacing:.04em;border:1px solid currentColor;opacity:.7}
.dnp-spin svg{display:block;width:100%;height:100%}
.dnp-sheen{position:absolute;inset:0;border-radius:50%;pointer-events:none;mix-blend-mode:soft-light;
 background:conic-gradient(from 30deg,rgba(255,255,255,0),rgba(255,255,255,.75) 10%,rgba(255,255,255,0) 24%,rgba(255,255,255,0) 50%,rgba(255,255,255,.75) 60%,rgba(255,255,255,0) 74%)}
.dnp-dashy{position:relative;flex:none;width:calc(var(--s)*.62);height:calc(var(--s)*.62);margin-top:calc(var(--s)*.08)}
.dnp-dashy::after{content:"";position:absolute;left:8%;right:8%;bottom:-8%;height:7%;border-radius:50%;background:rgba(0,0,0,.18);filter:blur(3px);z-index:0}
.dnp-dashy>div{position:relative;z-index:1}
.dnp-meta{flex:1 1 180px;min-width:0}
.dnp-title{margin:0;font-size:1.25em;font-weight:650;line-height:1.25;overflow-wrap:anywhere}
.dnp-artist{margin:2px 0 0;opacity:.75;overflow-wrap:anywhere}
.dnp-bar{margin-top:14px;height:3px;border-radius:3px;background:rgba(127,127,127,.3);overflow:hidden}
.dnp-bar>i{display:block;height:100%;background:var(--vinyl);transform-origin:left;transition:transform 1s linear}
.dnp-time{display:flex;justify-content:space-between;margin-top:4px;font-size:.8em;opacity:.65;font-variant-numeric:tabular-nums}
.dnp-link,.dnp-btn{font:inherit;color:inherit}
.dnp-actions{display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px;margin-top:12px}
.dnp-actions .dnp-logo{margin:0}
.dnp-link{display:inline-flex;align-items:center;min-height:44px;font-size:.85em;opacity:.8}
.dnp-btn{padding:10px 16px;min-height:44px;border-radius:999px;border:1.5px solid currentColor;background:transparent;cursor:pointer}
.dnp-btn:hover{background:rgba(127,127,127,.15)}.dnp-btn:focus-visible,.dnp-link:focus-visible{outline:3px solid var(--vinyl);outline-offset:2px}
.dnp-note{margin:6px 0 0;opacity:.75}
.dnp-logo{display:block;min-width:70px;height:auto}
@keyframes dnp-rot{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.dnp-spin{animation:none}.dnp-vinyl{transition:none}.dnp-bar>i{transition:none}}
`;

/** Label with printed text on a circle, so the rotation is visible, and a dark disc with grooves. */
function Grooves({ id }: { id: string }) {
  const rings: ReactElement[] = [];
  for (let r = 38; r <= 94; r += 2.6) rings.push(<circle key={r} r={r} fill="none" stroke="#000" strokeOpacity={r % 3 < 1 ? 0.28 : 0.14} strokeWidth="0.6" />);
  return (
    <svg viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
      <circle r="97" fill="none" stroke="#000" strokeOpacity=".35" strokeWidth="2" />
      {rings}
      <circle r="35" fill="#151515" />
      <defs><path id={id} d="M0,-25 a25,25 0 1,1 -0.01,0" /></defs>
      <text fontSize="7.2" fontWeight="700" fill="#e9e4d6" fontFamily="system-ui,sans-serif"><textPath href={`#${id}`} textLength="150" lengthAdjust="spacing">DASHY RECORDS · SIDE A ·</textPath></text>
      <circle cx="0" cy="-14" r="2.2" fill="#e9e4d6" />
      <circle r="3" fill="#f6f5f1" />
    </svg>
  );
}

/**
 * The progress bar and the two times. It owns the one-second tick, so only these few nodes re-render while a track plays
 * (not the cover, the record or Dashy). The bar glides (CSS transition) instead of jumping once a second.
 */
function Progress({ np, playing }: { np: NowPlaying; playing: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    setNow(Date.now());
    return () => clearInterval(t);
  }, [playing, np.id]);
  const pos = progressAt(np, playing ? now : np.fetchedAt);
  return (
    <>
      <div className="dnp-bar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, pos / np.durationMs)})` }} /></div>
      <div className="dnp-time" aria-hidden="true"><span>{mmss(pos)}</span><span>{mmss(np.durationMs)}</span></div>
    </>
  );
}

let uid = 0;

/**
 * Spotify block: album cover with a vinyl record behind it. The record slides out and spins while music plays; Dashy
 * dances next to it (his motion comes from core.ts, not from this component). Spotify's rules for the cover are followed:
 * shown whole and unaltered (not cropped, covered or animated), 4 px corners (8 px from 300 px up), and a link back to Spotify. The record colour is picked per album from a fixed palette; the cover is never used on the label.
 */
export function NowPlayingBlock({ spotifyLogoSrc, nowPlaying: np, status, onConnect, onDisconnect, driver = CALM, size = 160, bare = false, showDashy = true, error, className, style }: NowPlayingBlockProps) {
  const [id] = useState(() => `dnp-label-${++uid}`);
  const [coverFailed, setCoverFailed] = useState(false);
  const playing = !!np?.playing;

  useEffect(() => { setCoverFailed(false); }, [np?.coverUrl]);

  const dashy: DashyState = musicState(driver, playing);
  const px = typeof size === 'number' ? size : 0;
  const color = vinylColor(np ? `${np.album}|${np.artists[0] ?? ''}` : 'idle');
  const artists = np?.artists.join(', ') ?? '';

  return (
    <section className={`dnp${bare ? ' dnp-bare' : ''}${className ? ' ' + className : ''}`} data-playing={playing} data-paused={!!np && !playing} data-status={status}
      aria-label="Spotify" style={{ ['--s' as string]: typeof size === 'number' ? `${size}px` : size, ['--rc' as string]: px >= 300 ? '8px' : '4px', ['--vinyl' as string]: color, ...style }}>
      <style>{CSS}</style>
      <div className="dnp-stage">
        <div className="dnp-vinyl" aria-hidden="true">
          <div className="dnp-disc"><div className="dnp-spin"><Grooves id={id} /></div><div className="dnp-sheen" /></div>
        </div>
        <div className="dnp-sleeve">
          {np?.coverUrl && !coverFailed
            ? <img src={np.coverUrl} alt={`Albumhoes van ${np.album || np.title}${artists ? ` van ${artists}` : ''}`} decoding="async" referrerPolicy="no-referrer" onError={() => setCoverFailed(true)} />
            : <div className="dnp-blank" role="img" aria-label="Geen albumhoes"><svg width="40%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg></div>}
        </div>
      </div>

      {showDashy && <div className="dnp-dashy"><Dashy state={dashy} size="100%" shape="square" /></div>}

      <div className="dnp-meta">
        {np ? (
          <>
            <p className="dnp-title">{np.title}</p>
            {artists && <p className="dnp-artist">{artists}</p>}
            <p className="dnp-note" role="status">{playing ? 'Speelt nu' : 'Gepauzeerd'}</p>
            {!playing && <span className="dnp-pill" aria-hidden="true">Gepauzeerd</span>}
            <Progress np={np} playing={playing} />
          </>
        ) : status === 'connected' ? (
          <p className="dnp-title">Er speelt niets</p>
        ) : status === 'connecting' ? (
          <p className="dnp-title" role="status">Verbinden met Spotify…</p>
        ) : status === 'error' ? (
          <p className="dnp-note" role="alert">{error ?? 'Spotify is niet bereikbaar. Dashy probeert het straks opnieuw.'}</p>
        ) : (
          <p className="dnp-title">Spotify is niet verbonden</p>
        )}
        <div className="dnp-actions">
          {np && spotifyLogoSrc && <img className="dnp-logo" src={spotifyLogoSrc} alt="Spotify" width={70} />}
          {np?.trackUrl && <a className="dnp-link" href={np.trackUrl} target="_blank" rel="noopener noreferrer">LISTEN ON SPOTIFY</a>}
          {status !== 'connected' && status !== 'connecting' && onConnect && <button type="button" className="dnp-btn" onClick={onConnect}>Verbind met Spotify</button>}
          {status === 'connected' && onDisconnect && <button type="button" className="dnp-btn" onClick={onDisconnect}>Ontkoppel</button>}
        </div>
      </div>
    </section>
  );
}
