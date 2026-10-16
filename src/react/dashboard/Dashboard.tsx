import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { chooseAttention } from '../../dashboard/attention';
import { aimAt } from '../../dashboard/aim';
import { BLOCKS, tracksFor, type BlockId } from '../../dashboard/layout';
import { dashyLine } from '../../dashboard/lines';
import { clock, countdown, nextAppointmentAt, nextUp, planOrder, urgency, type PlanItem } from '../../dashboard/plan';
import type { DashyState } from '../../core';
import type { Resolution } from '../../driver';
import { musicState, type NowPlaying } from '../../spotify/model';
import type { SpotifyStatus } from '../../spotify/session';
import { NowPlayingBlock } from '../NowPlayingBlock';
import { useFocus, useOrientation } from './hooks';
import { useDashyBody } from './useDashyBody';
import { CSS } from './styles';

export interface DashboardMusic { nowPlaying: NowPlaying | null; status: SpotifyStatus; onConnect?: () => void; onDisconnect?: () => void; error?: string; spotifyLogoSrc?: string }
export interface DashboardProps {
  /** ms epoch; pass a ticking clock (useNow) */
  now: number;
  items: PlanItem[];
  /** What the state driver (or the MCP) says. Decides the attention and Dashy's default line. */
  resolution: Resolution;
  /** Override Dashy's state (default: dances when music plays and the driver is calm, otherwise the driver's state). */
  state?: DashyState;
  /** Claude's own line (MCP). Default: a line per situation. */
  line?: string;
  music: DashboardMusic;
  onToggleDone?: (id: string, done: boolean) => void;
  /** Working day for the day bar. Default 8 to 18. */
  workday?: { startHour: number; endHour: number };
  /** Reports the block in focus (or null) and why. */
  onFocusChange?: (block: BlockId | null, reason: string) => void;
  className?: string;
  style?: CSSProperties;
}

const TITLES: Record<BlockId, string> = { dashy: 'Dashy', now: 'Straks', plan: 'Planning', music: 'Muziek', clock: 'Vandaag' };
const STATE_NAMES: Record<DashyState, string> = { idle: 'Rustig', received: 'Genoteerd', working: 'Aan het werk', thinking: 'Denkt na', waiting: 'Wacht op jou', blocked: 'Zit vast', done: 'Klaar', happy: 'Blij', sad: 'Sip', angry: 'Boos', strict: 'Streng', dancing: 'Danst', sleepy: 'Slaperig' };
const dateFmt = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

const Chevrons = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
);

/**
 * Dashy's block IS his body: the white card is the body, his eyes are drawn on it, and it moves the way core.ts moves a body
 * (breathing, hopping, squashing, tilting, shaking). The text on it rides along with the movement but never tilts or squashes.
 * He looks at the block that needs attention, and a tap on his body startles him.
 */
function BodyBlock({ state, focus, attn, onToggle, lookAt, rootRef, children }: { state: DashyState; focus: boolean; attn: boolean; onToggle: (b: BlockId) => void; lookAt: BlockId | null; rootRef: RefObject<HTMLElement | null>; children: ReactNode }) {
  const section = useRef<HTMLElement>(null), card = useRef<HTMLDivElement>(null);
  const { look } = useDashyBody(card, section, state);
  useEffect(() => {
    if (!lookAt) return;
    const aim = () => {
      const me = section.current?.getBoundingClientRect(), root = rootRef.current, el = root?.querySelector(`[data-block="${lookAt}"]`)?.getBoundingClientRect();
      if (!me || !el || !root) return;
      const g = aimAt(me, el, root.getBoundingClientRect());
      if (g) look(g.nx, g.ny);
    };
    aim(); const t = setInterval(aim, 800); // the pointer in core.ts counts as "recent" for 2.5 s
    return () => clearInterval(t);
  }, [lookAt, rootRef]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section ref={section} className="db-block db-bodyblock" data-block="dashy" data-focus={focus} data-attn={attn} aria-labelledby="db-title-dashy" style={{ ['--area' as string]: 'dashy' }}>
      <div ref={card} className="db-bodycard" />
      <div className="db-inner">
        <header className="db-head">
          <h2 className="db-title" id="db-title-dashy">{TITLES.dashy}</h2>
          <button type="button" className="db-toggle" aria-pressed={focus} aria-label={focus ? `Verklein ${TITLES.dashy}` : `Vergroot ${TITLES.dashy}`} onClick={() => onToggle('dashy')}><Chevrons /></button>
        </header>
        <div className="db-body">{children}</div>
      </div>
    </section>
  );
}

function Block({ id, focus, attn, onToggle, children }: { id: BlockId; focus: boolean; attn: boolean; onToggle: (b: BlockId) => void; children: ReactNode }) {
  const label = `db-title-${id}`;
  return (
    <section className="db-block" data-block={id} data-focus={focus} data-attn={attn} aria-labelledby={label} style={{ ['--area' as string]: id }}>
      <header className="db-head">
        <h2 className="db-title" id={label}>{TITLES[id]}</h2>
        <button type="button" className="db-toggle" aria-pressed={focus} aria-label={focus ? `Verklein ${TITLES[id]}` : `Vergroot ${TITLES[id]}`} onClick={() => onToggle(id)}><Chevrons /></button>
      </header>
      <div className="db-body">{children}</div>
    </section>
  );
}

/**
 * The whole screen: five minimal blocks in a grid. Nothing is in focus while things are calm. When a block needs attention
 * (a deadline, an appointment, Dashy asking for help, new music) the grid tracks grow so that block takes about half the
 * screen, animated by the browser itself; the content simply reflows. Tap a block's button to grow it yourself (Esc lets go).
 */
export function Dashboard({ now, items, resolution, state, line, music, onToggleDone, workday = { startHour: 8, endHour: 18 }, onFocusChange, className, style }: DashboardProps) {
  const root = useRef<HTMLElement>(null);
  const orientation = useOrientation(root);

  // when did the current track start? (a new track is a small moment for the music block)
  const np = music.nowPlaying, playing = !!np?.playing;
  const [musicSince, setMusicSince] = useState<number | null>(null);
  const nowRef = useRef(now); nowRef.current = now;
  useEffect(() => { setMusicSince(playing ? nowRef.current : null); }, [playing, np?.id]);

  const plan = useMemo(() => planOrder(items, now), [items, now]);
  const next = nextUp(items, now);
  const candidate = chooseAttention({ now, resolution, nextEventAt: nextAppointmentAt(items, now), musicSince });
  const { focus, toggle, release } = useFocus(candidate, now);

  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    onFocusChange?.(focus.block, focus.reason);
    setAnnounce(focus.block ? `${TITLES[focus.block]} vergroot: ${focus.reason}` : '');
  }, [focus.block, focus.reason]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = tracksFor(orientation, focus.block);
  const nextIn = next ? countdown(next.at - now) : undefined;
  const dashyState = state ?? musicState(resolution, playing);
  const dashyText = line ?? dashyLine(resolution, { nextTitle: next?.item.title, nextIn, music: playing ? np!.title : undefined });

  const d = new Date(now), minutes = d.getHours() * 60 + d.getMinutes();
  const span = (workday.endHour - workday.startHour) * 60, done = Math.min(1, Math.max(0, (minutes - workday.startHour * 60) / span));
  const left = Math.max(0, workday.endHour * 60 - minutes);

  // Dashy looks at what needs attention (or at the music he is dancing to)
  const lookAt: BlockId | null = focus.block && focus.block !== 'dashy' ? focus.block : playing ? 'music' : null;

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') release(); };
  const attn = (b: BlockId) => focus.block === b && !focus.pinned;
  const big = next ? (() => { const m = Math.round((next.at - now) / 60_000); return m >= 60 ? { n: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, u: 'u' } : m < 1 ? { n: 'nu', u: '' } : { n: String(Math.max(0, m)), u: 'min' }; })() : null;

  return (
    <main ref={root} className={`db${className ? ' ' + className : ''}`} aria-label="Dashy" onKeyDown={onKey} data-orientation={orientation} data-focus={focus.block ?? 'none'}
      style={{ ['--areas' as string]: t.areas, ['--cols' as string]: t.cols, ['--rows' as string]: t.rows, ...style }}>
      <style>{CSS}</style>
      <div className="db-sr" role="status" aria-live="polite">{announce}</div>

      {BLOCKS.map(id => id === 'dashy' ? (
        <BodyBlock key={id} state={dashyState} focus={focus.block === id} attn={attn(id)} onToggle={toggle} lookAt={lookAt} rootRef={root}>
          <div className="db-dashy">
            <p className="db-chip">{STATE_NAMES[dashyState]}</p>
            <p className="db-line">{dashyText}</p>
            <p className="db-why">{focus.block === 'dashy' ? focus.reason : ''}</p>
          </div>
        </BodyBlock>
      ) : (
        <Block key={id} id={id} focus={focus.block === id} attn={attn(id)} onToggle={toggle}>
          {id === 'now' && (
            <div className="db-now">
              {next && big ? (<>
                <p className="db-big">{big.n}{big.u && <small>{big.u}</small>}</p>
                <p className="db-what">{next.item.title}</p>
                <p className="db-when">{next.item.kind === 'event' ? 'Afspraak' : 'Deadline'} om {clock(next.at)}</p>
              </>) : <p className="db-empty">Niets gepland.</p>}
              <ul className="db-more">{plan.filter(i => !i.done && i.at !== null && i.id !== next?.item.id).slice(0, 3).map(i => <li key={i.id}>{clock(i.at!)} · {i.title}</li>)}</ul>
              <p className="db-why">{focus.block === 'now' ? focus.reason : ''}</p>
            </div>
          )}
          {id === 'plan' && (
            <>
              <ul className="db-plan" aria-label="Planning van vandaag">
                {plan.length === 0 && <li className="db-empty">Een lege dag. Voeg iets kleins toe.</li>}
                {plan.map(i => (
                  <li key={i.id} className="db-item" data-kind={i.kind} data-done={!!i.done} data-urgency={urgency(i, now)}>
                    {i.kind === 'task'
                      ? <button type="button" className="db-check" role="checkbox" aria-checked={!!i.done} aria-label={`${i.title}: markeer als ${i.done ? 'niet klaar' : 'klaar'}`} onClick={() => onToggleDone?.(i.id, !i.done)}><i /></button>
                      : <span className="db-dot" aria-hidden="true" />}
                    <span className="db-name">{i.title}{i.kind === 'event' && <span className="db-sr"> (afspraak)</span>}</span>
                    <span className="db-time">{i.at !== null ? (i.done ? '' : clock(i.at)) : ''}</span>
                    {i.note && <span className="db-note">{i.note}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {id === 'music' && (
            <div className="db-music">
              <NowPlayingBlock bare showDashy={false} size="var(--music-s)" nowPlaying={music.nowPlaying} status={music.status} onConnect={music.onConnect} onDisconnect={music.onDisconnect} error={music.error} spotifyLogoSrc={music.spotifyLogoSrc} driver={resolution} />
            </div>
          )}
          {id === 'clock' && (
            <div className="db-clock">
              <p className="db-time-big">{clock(now)}</p>
              <p className="db-date">{dateFmt.format(now)}</p>
              <div className="db-day" aria-hidden="true"><i style={{ transform: `scaleX(${done})` }} /></div>
              <p className="db-left">{left > 0 ? `Nog ${countdown(left * 60_000)} van de werkdag` : 'De werkdag zit erop.'}</p>
            </div>
          )}
        </Block>
      ))}
    </main>
  );
}
