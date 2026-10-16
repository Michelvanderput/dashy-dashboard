import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
import type { DashyState } from '../core';
import { initialDriverState, resolve, type Resolution } from '../driver';
import { musicState, progressAt, vinylColor, type NowPlaying } from '../spotify/model';
import type { SpotifyStatus } from '../spotify/session';
import type { Command } from '../spotify/client';
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
  /** Previous, play, pause, next. Pass it (with `canControl`) to show the controls. Resolves to whether it worked. */
  onControl?: (c: Command) => Promise<boolean> | void;
  /** The login may control playback. false/undefined: no controls. */
  canControl?: boolean;
  /** The saved login predates the controls: show a small "connect again" instead of them (uses onConnect). */
  needsReconnect?: boolean;
  /** Why the last control did not work (shown quietly under the controls). */
  controlError?: string;
  /** Message to show with status "error". */
  error?: string;
  className?: string;
  style?: CSSProperties;
}

const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const CALM: Resolution = resolve(initialDriverState(0), 0);

const CSS = `
.dnp{--s:160px;--vinyl:#c8102e;position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:20px 28px;padding:20px 24px;border-radius:20px;
 background:color-mix(in srgb,var(--vinyl) 9%,#f6f5f1);color:#16181a;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
@media (prefers-color-scheme:dark){.dnp{background:color-mix(in srgb,var(--vinyl) 16%,#17181a);color:#f1f0ec}}
.dnp-bare{padding:0;border-radius:0;background:none;overflow:visible;gap:12px 24px;font-family:inherit}
.dnp-bare .dnp-title{font-size:clamp(1.1em,1em + 1.2vw,1.6em);font-weight:550;letter-spacing:-.02em;line-height:1.2;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.dnp-bare .dnp-artist{font-size:clamp(.92em,.85em + .6vw,1.15em);overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden}
.dnp-bare .dnp-note{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.dnp-bare .dnp-bar{height:4px;margin-top:16px;border-radius:4px}
.dnp-bare .dnp-bar>i{background:currentColor;opacity:.7}
.dnp-bare .dnp-time{font-size:.9em;opacity:.75}
.dnp-bare .dnp-btn{border:0;padding:0 2px;min-height:44px;opacity:.7;text-decoration:underline;text-underline-offset:4px;text-decoration-color:rgba(127,127,127,.5)}
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
.dnp-hasmenu .dnp-meta{padding-right:36px}
.dnp-more{position:absolute;top:0;right:0;z-index:6}
.dnp:not(.dnp-bare) .dnp-more{top:6px;right:6px}
.dnp-more-btn{display:grid;place-items:center;width:44px;height:44px;margin:-8px -8px 0 0;border:0;border-radius:50%;background:transparent;color:inherit;opacity:.45;cursor:pointer;transition:opacity .15s,background .15s}
.dnp-more-btn:hover,.dnp-more-btn[aria-expanded="true"]{opacity:.95;background:rgba(127,127,127,.16)}
.dnp-more-btn:focus-visible,.dnp-mi:focus-visible,.dnp-ctl button:focus-visible{outline:3px solid var(--vinyl);outline-offset:2px;opacity:1}
.dnp-menu{position:absolute;top:38px;right:-4px;min-width:200px;padding:6px;border-radius:14px;background:color-mix(in srgb,var(--vinyl) 6%,#fff);color:#16181a;box-shadow:0 12px 32px -8px rgba(0,0,0,.35),0 0 0 1px rgba(127,127,127,.2);display:grid}
@media (prefers-color-scheme:dark){.dnp-menu{background:color-mix(in srgb,var(--vinyl) 10%,#202124);color:#f1f0ec}}
.dnp-mi{display:flex;align-items:center;min-height:44px;padding:0 14px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:.9em;text-align:left;text-decoration:none;cursor:pointer;letter-spacing:.02em}
.dnp-mi:hover{background:rgba(127,127,127,.16)}
.dnp-ctl{display:flex;align-items:center;gap:6px;margin-top:10px}
.dnp-ctl button{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer;opacity:.8;transition:background .15s,opacity .15s,transform .1s}
.dnp-ctl button:hover{background:rgba(127,127,127,.18);opacity:1}.dnp-ctl button:active{transform:scale(.94)}.dnp-ctl button:disabled{opacity:.4;cursor:default}
.dnp-ctl .dnp-main{width:52px;height:52px;background:var(--vinyl);color:#fff;opacity:1}
.dnp-ctl .dnp-main:hover{background:var(--vinyl);filter:brightness(1.1)}
.dnp-hint{margin:6px 0 0;font-size:.8em;opacity:.75}
.dnp-link{display:inline-flex;align-items:center;min-height:44px;font-size:.85em;opacity:.8}
.dnp-btn{padding:10px 16px;min-height:44px;border-radius:999px;border:1.5px solid currentColor;background:transparent;cursor:pointer}
.dnp-btn:hover{background:rgba(127,127,127,.15)}.dnp-btn:focus-visible,.dnp-link:focus-visible{outline:3px solid var(--vinyl);outline-offset:2px}
.dnp-note{margin:6px 0 0;opacity:.75}
.dnp-logo{display:block;min-width:70px;height:auto}
@keyframes dnp-rot{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.dnp-spin{animation:none}.dnp-vinyl{transition:none}.dnp-bar>i{transition:none}.dnp-more-btn,.dnp-ctl button{transition:none}}
`;

/** Label with printed text on a circle, so the rotation is visible, and a dark disc with grooves. */
export function Grooves({ id }: { id: string }) {
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

const Icon = ({ d }: { d: string }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d={d} /></svg>;
const ICON = { prev: 'M6 6h2v12H6zM9.5 12l8.5 6V6z', next: 'M16 6h2v12h-2zM6 18l8.5-6L6 6z', play: 'M8 5v14l11-7z', pause: 'M6 5h4v14H6zM14 5h4v14h-4z' } as const;

/** The three controls. A control is disabled while its command is on its way, so a double tap does not skip two tracks. */
function Controls({ playing, onControl }: { playing: boolean; onControl: (c: Command) => Promise<boolean> | void }) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true); useEffect(() => () => { mounted.current = false; }, []);
  const run = async (c: Command) => { if (busy) return; setBusy(true); try { await onControl(c); } finally { if (mounted.current) setBusy(false); } };
  return (
    <div className="dnp-ctl" role="group" aria-label="Bediening">
      <button type="button" disabled={busy} aria-label="Vorige" onClick={() => void run('previous')}><Icon d={ICON.prev} /></button>
      <button type="button" className="dnp-main" disabled={busy} aria-label={playing ? 'Pauzeer' : 'Speel af'} onClick={() => void run(playing ? 'pause' : 'play')}><Icon d={playing ? ICON.pause : ICON.play} /></button>
      <button type="button" disabled={busy} aria-label="Volgende" onClick={() => void run('next')}><Icon d={ICON.next} /></button>
    </div>
  );
}

/** The quiet "..." at the top right: the link to Spotify and disconnect live in here. Keyboard: Enter/Space/Down opens, Up/Down move, Escape and Tab close. */
function MoreMenu({ trackUrl, onDisconnect }: { trackUrl: string | null; onDisconnect?: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const items = () => [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  const close = (refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const away = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const key = (e: ReactKeyboardEvent) => {
    const list = items(), i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
  };
  if (!trackUrl && !onDisconnect) return null;
  return (
    <div className="dnp-more" ref={root} onKeyDown={key}>
      <button type="button" ref={trigger} className="dnp-more-btn" aria-label="Meer opties" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && (
        <div className="dnp-menu" role="menu" aria-label="Spotify">
          {trackUrl && <a role="menuitem" className="dnp-mi" href={trackUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>LISTEN ON SPOTIFY</a>}
          {onDisconnect && <button type="button" role="menuitem" className="dnp-mi" onClick={() => { close(false); onDisconnect(); }}>Ontkoppel</button>}
        </div>
      )}
    </div>
  );
}

let uid = 0;

/**
 * Spotify block: album cover with a vinyl record behind it. The record slides out and spins while music plays; Dashy
 * dances next to it (his motion comes from core.ts, not from this component). Spotify's rules for the cover are followed:
 * shown whole and unaltered (not cropped, covered or animated), 4 px corners (8 px from 300 px up), and a link back to Spotify. The record colour is picked per album from a fixed palette; the cover is never used on the label.
 */
export function NowPlayingBlock({ spotifyLogoSrc, nowPlaying: np, status, onConnect, onDisconnect, onControl, canControl, needsReconnect, controlError, driver = CALM, size = 160, bare = false, showDashy = true, error, className, style }: NowPlayingBlockProps) {
  const [id] = useState(() => `dnp-label-${++uid}`);
  const [coverFailed, setCoverFailed] = useState(false);
  const playing = !!np?.playing;

  useEffect(() => { setCoverFailed(false); }, [np?.coverUrl]);

  const dashy: DashyState = musicState(driver, playing);
  const px = typeof size === 'number' ? size : 0;
  const color = vinylColor(np ? `${np.album}|${np.artists[0] ?? ''}` : 'idle');
  const artists = np?.artists.join(', ') ?? '';
  // the "..." menu holds the link to the track and disconnect; while not connected, "connect" stays a visible button
  const menu = status === 'connected' && !!(np?.trackUrl || onDisconnect);

  return (
    <section className={`dnp${bare ? ' dnp-bare' : ''}${menu ? ' dnp-hasmenu' : ''}${className ? ' ' + className : ''}`} data-playing={playing} data-paused={!!np && !playing} data-status={status}
      aria-label="Spotify" style={{ ['--s' as string]: typeof size === 'number' ? `${size}px` : size, ['--rc' as string]: px >= 300 ? '8px' : '4px', ['--vinyl' as string]: color, ...style }}>
      <style>{CSS}</style>
      {menu && <MoreMenu trackUrl={np?.trackUrl ?? null} onDisconnect={onDisconnect} />}
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
            <Progress np={np} playing={playing} />
            {onControl && canControl && <Controls playing={playing} onControl={onControl} />}
            {needsReconnect && onConnect && <button type="button" className="dnp-btn" onClick={onConnect}>Koppel opnieuw voor bediening</button>}
            {controlError && <p className="dnp-hint" aria-live="polite">{controlError}</p>}
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
          {np && spotifyLogoSrc && (np.trackUrl
            ? <a href={np.trackUrl} target="_blank" rel="noopener noreferrer" aria-label="Open in Spotify"><img className="dnp-logo" src={spotifyLogoSrc} alt="Spotify" width={70} /></a>
            : <img className="dnp-logo" src={spotifyLogoSrc} alt="Spotify" width={70} />)}
          {status !== 'connected' && status !== 'connecting' && onConnect && <button type="button" className="dnp-btn" onClick={onConnect}>Verbind met Spotify</button>}
        </div>
      </div>
    </section>
  );
}
