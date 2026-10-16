import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { chooseAttention } from '../../dashboard/attention';
import { aimAt } from '../../dashboard/aim';
import { BLOCKS, tracksFor, type BlockId } from '../../dashboard/layout';
import { dashyLine } from '../../dashboard/lines';
import { doneToday, habitToNudge, weekCount, type Habit } from '../../dashboard/habits';
import { isOver, remainingMs, timerLabel, timerSpoken, MORE_MINUTES, SESSION_MINUTES, type Session } from '../../dashboard/session';
import type { UrgeOutcome } from '../../dashboard/urge';
import { UrgeSheet } from './UrgeSheet';
import { partOfDay, type Later } from '../../dashboard/time';
import { clock, countdown, nextAppointmentAt, nextUp, nowTask, planOrder, pressingTask, urgency, type PlanItem } from '../../dashboard/plan';
import type { DashyState } from '../../core';
import type { Resolution } from '../../driver';
import { musicState, type NowPlaying } from '../../spotify/model';
import type { SpotifyStatus } from '../../spotify/session';
import { NowPlayingBlock } from '../NowPlayingBlock';
import { useFocus, useOrientation, useWakeLock } from './hooks';
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
  /** The task someone chose to do first (MCP or a tap). It becomes "Nu" unless a deadline is closer. */
  focusTaskId?: string | null;
  /** The running focus session (one task, a short block of time), or null. Owned by the caller so it survives re-renders. */
  session?: Session | null;
  onStartSession?: (task: { id: string; title: string }) => void;
  onSessionEnd?: (outcome: 'done' | 'stop' | 'more') => void;
  /** Habits (no streaks) and checking today. */
  habits?: Habit[];
  onHabit?: (id: string, checked: boolean) => void;
  /** Quick add of a task by title. Without it the plan has no input. */
  onAdd?: (title: string) => void;
  /** "Even stoppen" sheet. Called when it closes, with how it ended (never with content). Default: the button is shown. */
  onUrge?: (outcome: UrgeOutcome) => void;
  showUrge?: boolean;
  /** Move an open task to a new moment ("Later"). Without it there is no Later button. */
  onSnooze?: (id: string, until: Later) => void;
  /** Pause / stuck / waiting as the server knows them, and a way to switch them. */
  flags?: { break: boolean; blocked: boolean; waiting: boolean };
  onFlag?: (flag: 'break' | 'blocked' | 'waiting', value: boolean) => void;
  /** Minutes of finished focus sessions today. */
  focusedMinutes?: number;
  /** Text for an empty planning. Default: "Een lege dag. Voeg iets kleins toe." */
  emptyText?: string;
  /** Dark and dimmed (for the night, a phone on the charger). */
  night?: boolean;
  /** Keep the screen awake while the dashboard is visible (a phone on the charger). Default false. */
  keepAwake?: boolean;
  /** Working day for the day bar. Default 8 to 18. */
  workday?: { startHour: number; endHour: number };
  /** Reports the block in focus (or null) and why. */
  onFocusChange?: (block: BlockId | null, reason: string) => void;
  className?: string;
  style?: CSSProperties;
}

const TITLES: Record<BlockId, string> = { dashy: 'Dashy', now: 'Nu', plan: 'Planning', music: 'Muziek', clock: 'Vandaag' };
const dateFmt = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

const Chevrons = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
);

/**
 * Dashy IS the block: the white block is his body and it stays exactly where it is, like every other block. All the life is
 * in his face: the eyes look around, blink and take his mood, and the face moves, tilts and squashes inside the block (never
 * outside it). He looks at the block that needs attention; a tap on him startles him.
 */
function BodyBlock({ state, focus, attn, onToggle, lookAt, rootRef, say, why, onHelp }: { onHelp?: () => void; state: DashyState; focus: boolean; attn: boolean; onToggle: (b: BlockId) => void; lookAt: BlockId | null; rootRef: RefObject<HTMLElement | null>; say: string; why: string }) {
  const section = useRef<HTMLElement>(null), face = useRef<HTMLDivElement>(null);
  const { look } = useDashyBody(face, state);
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
      <div ref={face} className="db-face" />
      <h2 className="db-sr" id="db-title-dashy">{TITLES.dashy}</h2>
      <button type="button" className="db-toggle" aria-pressed={focus} aria-label={focus ? `Verklein ${TITLES.dashy}` : `Vergroot ${TITLES.dashy}`} onClick={() => onToggle('dashy')}><Chevrons /></button>
      <div className="db-body"><div className="db-say"><p className="db-line">{say}</p><p className="db-why">{why}</p></div></div>
      {onHelp && <button type="button" className="db-help" onClick={onHelp} title="Even stoppen (S)">Even stoppen</button>}
    </section>
  );
}

const INTERACTIVE = 'button, a, input, [role="checkbox"]';

function Block({ id, focus, attn, onToggle, children }: { id: BlockId; focus: boolean; attn: boolean; onToggle: (b: BlockId) => void; children: ReactNode }) {
  const label = `db-title-${id}`;
  return (
    <section className="db-block" data-block={id} data-focus={focus} data-attn={attn} aria-labelledby={label} style={{ ['--area' as string]: id }}
      onClick={e => { if (!(e.target as Element).closest(INTERACTIVE)) onToggle(id); }}>
      <h2 className="db-sr" id={label}>{TITLES[id]}</h2>
      <button type="button" className="db-toggle" aria-pressed={focus} aria-label={focus ? `Verklein ${TITLES[id]}` : `Vergroot ${TITLES[id]}`} onClick={() => onToggle(id)}><Chevrons /></button>
      <div className="db-body">{children}</div>
    </section>
  );
}

/**
 * The whole screen: five minimal blocks in a grid. Nothing is in focus while things are calm. When a block needs attention
 * (a deadline, an appointment, Dashy asking for help, new music) the grid tracks grow so that block takes about half the
 * screen, animated by the browser itself; the content simply reflows. Tap a block's button to grow it yourself (Esc lets go).
 */
export function Dashboard({ now, items, resolution, state, line, music, onToggleDone, focusTaskId, session = null, onStartSession, onSessionEnd, habits = [], onHabit, onAdd, onUrge, showUrge = true, onSnooze, flags, onFlag, focusedMinutes = 0, emptyText = 'Een lege dag. Voeg iets kleins toe.', night = false, keepAwake = false, workday = { startHour: 8, endHour: 18 }, onFocusChange, className, style }: DashboardProps) {
  const root = useRef<HTMLElement>(null);
  const orientation = useOrientation(root);

  // when did the current track start? (a new track is a small moment for the music block)
  const np = music.nowPlaying, playing = !!np?.playing;
  const [musicSince, setMusicSince] = useState<number | null>(null);
  const nowRef = useRef(now); nowRef.current = now;
  useEffect(() => { setMusicSince(playing ? nowRef.current : null); }, [playing, np?.id]);

  const plan = useMemo(() => planOrder(items, now), [items, now]);
  const next = nextUp(items, now);
  const late = plan.find(i => i.kind === 'task' && !i.done && urgency(i, now) === 'late') ?? null; // open, long past its deadline: named, never blamed
  const picked = nowTask(items, now, focusTaskId);
  // While you are working on a task it stays "Nu", unless a deadline on another task is within 15 minutes.
  const working = session ? items.find(i => i.id === session.taskId && !i.done) : undefined;
  const pick = working && picked?.why !== 'deadline-near' ? { item: working, reason: 'Je bent bezig', why: 'chosen' as const } : picked;
  useEffect(() => { if (session && !working) onSessionEnd?.('stop'); }, [session, working]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = nextUp(items.filter(i => i.id !== pick?.item.id), now);
  const stale = late;
  const candidate = chooseAttention({ now, resolution, nextEventAt: nextAppointmentAt(items, now), musicSince });
  const { focus, toggle, release } = useFocus(candidate, now);

  useWakeLock(keepAwake);
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    onFocusChange?.(focus.block, focus.reason);
    setAnnounce(focus.block ? `${TITLES[focus.block]} vergroot: ${focus.reason}` : '');
  }, [focus.block, focus.reason]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = tracksFor(orientation, focus.block);
  const nextIn = next ? countdown(next.at - now) : undefined;
  const calm = resolution.rule === 'idle' || resolution.rule === 'quiet' || resolution.rule === 'working';
  const sessionOn = !!session && calm;
  const sessionOver = !!session && isOver(session, now);
  const dashyState = state ?? (sessionOn ? 'working' : musicState(resolution, playing));
  const [urgeOpen, setUrgeOpen] = useState(false), [laterOpen, setLaterOpen] = useState(false);
  const nudge = habitToNudge(habits, now);
  const press = pressingTask(items, now);
  const dashyText = line ?? (sessionOn ? (sessionOver ? `Tijd om. ${session!.title}: klaar, of nog ${MORE_MINUTES} minuten?` : 'Ik werk met je mee.') : null) ?? dashyLine(resolution, {
    task: press ? { title: press.title, in: countdown(press.at! - now), overdue: press.at! < now - 60_000, at: clock(press.at!) } : undefined,
    part: partOfDay(now),
    habit: nudge ? { title: nudge.title, plan: nudge.plan } : undefined,
    nowTitle: pick?.item.title, nextTitle: next?.item.title, nextIn, stale: late?.title, music: playing ? np!.title : undefined,
  });

  const d = new Date(now), minutes = d.getHours() * 60 + d.getMinutes();
  const span = (workday.endHour - workday.startHour) * 60, done = Math.min(1, Math.max(0, (minutes - workday.startHour * 60) / span));
  const left = Math.max(0, workday.endHour * 60 - minutes);

  // Dashy looks at what needs attention (or at the music he is dancing to)
  const lookAt: BlockId | null = focus.block && focus.block !== 'dashy' ? focus.block : playing ? 'music' : null;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { release(); setLaterOpen(false); return; }
    // Keyboard shortcuts for desktop: n = new task, b = begin, k = klaar, l = later, p = pauze, s = even stoppen
    const el = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey || e.altKey || urgeOpen || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return;
    const task = pick?.item.kind === 'task' ? pick.item : null;
    switch (e.key.toLowerCase()) {
      case 'n': if (onAdd) { e.preventDefault(); root.current?.querySelector<HTMLInputElement>('.db-add input')?.focus(); } break;
      case 'b': if (task && onStartSession && !session) onStartSession({ id: task.id, title: task.title }); break;
      case 'k': if (task && onToggleDone) { onToggleDone(task.id, true); if (session?.taskId === task.id) onSessionEnd?.('done'); } break;
      case 'l': if (task && onSnooze) setLaterOpen(o => !o); break;
      case 'p': if (onFlag && flags) onFlag('break', !flags.break); break;
      case 's': if (showUrge) setUrgeOpen(true); break;
    }
  };
  // on the document, so the shortcuts also work when nothing on the page has focus
  const onKeyRef = useRef(onKey); onKeyRef.current = onKey;
  useEffect(() => { const h = (e: KeyboardEvent) => onKeyRef.current(e); document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, []);
  const attn = (b: BlockId) => focus.block === b && !focus.pinned;
  const big = next ? (() => { const m = Math.round((next.at - now) / 60_000); return m >= 60 ? { n: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, u: 'u' } : m < 1 ? { n: 'nu', u: '' } : { n: String(Math.max(0, m)), u: 'min' }; })() : null;

  return (
    <main ref={root} className={`db${className ? ' ' + className : ''}`} aria-label="Dashy" data-orientation={orientation} data-focus={focus.block ?? 'none'} data-night={night} data-theme={night ? 'dark' : undefined}
      style={{ ['--areas' as string]: t.areas, ['--cols' as string]: t.cols, ['--rows' as string]: t.rows, ...style }}>
      <style>{CSS}</style>
      <h1 className="db-sr">Dashy: je dag in één oogopslag</h1>
      <div className="db-sr" role="status" aria-live="polite">{announce}</div>

      {BLOCKS.map(id => id === 'dashy' ? (
        <BodyBlock key={id} state={dashyState} focus={focus.block === id} attn={attn(id)} onToggle={toggle} lookAt={lookAt} rootRef={root} say={dashyText} why={focus.block === 'dashy' ? focus.reason : ''} onHelp={showUrge ? () => setUrgeOpen(true) : undefined} />
      ) : (
        <Block key={id} id={id} focus={focus.block === id} attn={attn(id)} onToggle={toggle}>
          {id === 'now' && (
            <div className="db-now" data-kind={pick?.item.kind ?? 'none'}>
              {pick ? (<>
                <p className="db-what">{pick.item.title}</p>
                <p className="db-when">{pick.reason}{pick.item.at !== null && pick.item.at >= now && pick.item.at - now <= 2 * 3600_000 ? ` · over ${countdown(pick.item.at - now)}` : ''}</p>
                {pick.item.note && <p className="db-note-now">{pick.item.note}</p>}
                {session && session.taskId === pick.item.id ? (
                  <>
                    <p className="db-timer" role="timer" aria-live="off" aria-label={timerSpoken(remainingMs(session, now))}>{timerLabel(remainingMs(session, now))}</p>
                    <div className="db-actions">
                      {onToggleDone && <button type="button" className="db-done" onClick={() => { onToggleDone(pick.item.id, true); onSessionEnd?.('done'); }} aria-label={`${pick.item.title}: markeer als klaar`}>Klaar</button>}
                      {sessionOver && <button type="button" className="db-done ghost" onClick={() => onSessionEnd?.('more')}>Nog {MORE_MINUTES} min</button>}
                      <button type="button" className="db-done ghost" onClick={() => onSessionEnd?.('stop')}>Stop</button>
                    </div>
                  </>
                ) : pick.item.kind === 'task' && laterOpen ? (
                  <div className="db-actions" role="group" aria-label={`${pick.item.title}: nieuw moment`}>
                    <button type="button" className="db-done ghost" onClick={() => { onSnooze?.(pick.item.id, 'plus30'); setLaterOpen(false); }}>+30 min</button>
                    <button type="button" className="db-done ghost" onClick={() => { onSnooze?.(pick.item.id, 'tomorrow'); setLaterOpen(false); }}>Morgen</button>
                  </div>
                ) : pick.item.kind === 'task' && (
                  <div className="db-actions">
                    {onStartSession && <button type="button" className="db-done" onClick={() => onStartSession({ id: pick.item.id, title: pick.item.title })} title="Begin (B)" aria-label={`Begin ${SESSION_MINUTES} minuten aan ${pick.item.title}`}>Begin ({SESSION_MINUTES} min)</button>}
                    {onToggleDone && <button type="button" className={onStartSession ? 'db-done ghost' : 'db-done'} title="Klaar (K)" onClick={() => onToggleDone(pick.item.id, true)} aria-label={`${pick.item.title}: markeer als klaar`}>Klaar</button>}
                    {onSnooze && <button type="button" className="db-done ghost" aria-expanded={false} title="Later (L)" onClick={() => setLaterOpen(true)} aria-label={`${pick.item.title}: later`}>Later</button>}
                  </div>
                )}
                {after && <p className="db-after">Straks: {clock(after.at)} · {after.item.title}</p>}
              </>) : items.some(i => i.kind === 'task' && i.done) ? <p className="db-empty">Alles gedaan.</p> : <p className="db-empty">Niets te doen.</p>}
              <p className="db-why">{focus.block === 'now' ? focus.reason : ''}</p>
            </div>
          )}
          {id === 'plan' && (
            <div className="db-planwrap">
              <ul className="db-plan" aria-label="Planning van vandaag">
                {plan.length === 0 && <li className="db-empty">{emptyText}</li>}
                {plan.map(i => (
                  <li key={i.id} className="db-item" data-kind={i.kind} data-done={!!i.done} data-urgency={urgency(i, now)}>
                    {i.kind === 'task'
                      ? <button type="button" className="db-check" role="checkbox" aria-checked={!!i.done} aria-label={`${i.title}: markeer als ${i.done ? 'niet klaar' : 'klaar'}`} onClick={() => onToggleDone?.(i.id, !i.done)}><i /></button>
                      : <span aria-hidden="true" />}
                    <span className="db-name">{i.title}{i.kind === 'event' && <span className="db-sr"> (afspraak)</span>}</span>
                    <span className="db-time">{i.at !== null ? (i.done ? '' : urgency(i, now) === 'late' ? 'nog open' : clock(i.at)) : ''}</span>
                    {i.note && <span className="db-note">{i.note}</span>}
                  </li>
                ))}
              </ul>
              {habits.length > 0 && (
                <ul className="db-habits" aria-label="Gewoontes deze week">
                  {habits.map(h => (
                    <li key={h.id} className="db-item db-habit" data-met={weekCount(h, now) >= h.perWeek}>
                      <button type="button" className="db-check" role="checkbox" aria-checked={doneToday(h, now)} disabled={!onHabit} aria-label={`${h.title}: vandaag ${doneToday(h, now) ? 'niet gedaan' : 'gedaan'}`} onClick={() => onHabit?.(h.id, !doneToday(h, now))}><i /></button>
                      <span className="db-name">{h.title}</span>
                      <span className="db-time">{weekCount(h, now)} van {h.perWeek}<span className="db-sr"> deze week</span></span>
                      {h.plan && <span className="db-note">{h.plan}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {onAdd && <AddTask onAdd={onAdd} />}
            </div>
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
              {focusedMinutes > 0 && <p className="db-focused">Gefocust: {focusedMinutes} min</p>}
              {onFlag && flags && (
                <div className="db-flags" role="group" aria-label="Hoe gaat het?">
                  <button type="button" aria-pressed={flags.break} title="Pauze (P)" onClick={() => onFlag('break', !flags.break)}>Pauze</button>
                  <button type="button" aria-pressed={flags.blocked} onClick={() => onFlag('blocked', !flags.blocked)}>Ik zit vast</button>
                </div>
              )}
            </div>
          )}
        </Block>
      ))}
      {urgeOpen && <UrgeSheet onClose={o => { setUrgeOpen(false); onUrge?.(o); }} />}
    </main>
  );
}

/** One field, one button: a task by title. The deadline can be set by Claude later. */
function AddTask({ onAdd }: { onAdd: (title: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form className="db-add" onSubmit={e => { e.preventDefault(); const t = v.trim(); if (t) { onAdd(t.slice(0, 80)); setV(''); } }}>
      <input value={v} onChange={e => setV(e.target.value)} maxLength={80} aria-label="Nieuwe taak" placeholder="Nieuwe taak" enterKeyHint="done" />
      <button type="submit" disabled={!v.trim()}>Toevoegen</button>
    </form>
  );
}
