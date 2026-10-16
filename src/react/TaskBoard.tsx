import type { CSSProperties } from 'react';
import { taskTiming } from '../day';
import type { Briefing } from '../briefing';
import type { DashTask } from '../tasks';
import { useMinute } from './useMinute';

export interface TaskBoardProps {
  /** Open tasks in the order the server gave them (state "now" first, then "later"). */
  tasks: DashTask[];
  /** Fixed time for tests and screenshots. Default: the real time, updated on the minute. */
  now?: number;
  mode?: 'work' | 'free';
  /** Work tasks that wait until the next working day (free time). */
  waiting?: number;
  /** Open tasks from an earlier day. */
  leftOpen?: number;
  doneToday?: number;
  /** Check a task off. Without it there is no button (a look-only screen). */
  onComplete?: (id: string) => void | Promise<unknown>;
  justDone?: { id: string; title: string } | null;
  onUndo?: () => void | Promise<unknown>;
  /** Extra quiet lines (not up to date, an error). */
  notes?: string[];
  /** The moment of the day (morning plan, afternoon nudge, evening check-in). Takes the place of the "Daarna" list. */
  plan?: Briefing | null;
  /** Smaller, for a low screen. */
  compact?: boolean;
  /** How much to leave out so it fits: 0 all, 1 smaller, 2 also no list, 3 also no note, 4 only the title. Set by the page (useFit). */
  level?: number;
  style?: CSSProperties;
}

export const CATEGORY: Record<string, { label: string; color: string }> = {
  werk: { label: 'werk', color: '#4f8ef7' }, thuis: { label: 'thuis', color: '#e8a33d' }, sport: { label: 'sport', color: '#3fb27f' }, prive: { label: 'privé', color: '#a279e8' },
};
const cat = (c: string) => CATEGORY[c] ?? { label: c, color: 'currentColor' };

const CSS = `
.tb{display:grid;gap:18px;align-content:start;width:100%}
.tb-hero{position:relative;display:grid;gap:10px;padding:clamp(18px,3vmin,32px) clamp(18px,3vmin,32px) clamp(18px,3vmin,32px) calc(clamp(18px,3vmin,32px) + 6px);border-radius:28px;background:var(--card);border:1px solid var(--line);overflow:hidden;animation:tb-in .5s cubic-bezier(.2,.8,.2,1) both}
.tb-hero::before{content:"";position:absolute;inset:0 auto 0 0;width:6px;background:var(--cat,currentColor);opacity:.9}
.tb-label{display:flex;align-items:center;gap:10px;font-size:.8rem;letter-spacing:.08em;text-transform:uppercase}
.tb-label>span:first-child{opacity:.65}
.tb-cat{display:inline-flex;align-items:center;gap:6px;text-transform:none;letter-spacing:0;font-size:.85rem;opacity:.85}
.tb-dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--cat,currentColor)}
.tb-title{margin:0;font-size:clamp(1.6rem,5vmin,3rem);font-weight:650;line-height:1.1;letter-spacing:-.02em;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.tb-calm{font-weight:500;opacity:.8}
.tb-meta{display:flex;flex-wrap:wrap;gap:8px}
.tb-chip{padding:3px 12px;border-radius:999px;border:1.5px solid var(--line);font-size:.9rem;font-variant-numeric:tabular-nums}
.tb-soon{border-color:#d9730d}
.tb-quiet{opacity:.7}
.tb-note{margin:0;opacity:.75;font-size:clamp(.95rem,2.2vmin,1.2rem);max-width:42ch}
.tb-done{justify-self:start;display:inline-flex;align-items:center;gap:10px;min-height:56px;padding:0 30px;margin-top:4px;border:0;border-radius:999px;background:var(--ink);color:var(--bg);font:inherit;font-weight:650;font-size:1.1rem;cursor:pointer;transition:transform .12s,filter .15s}
.tb-done:hover{filter:brightness(1.18)}.tb-done:active{transform:scale(.97)}
.tb-done:focus-visible,.tb-link:focus-visible{outline:3px solid var(--ink);outline-offset:3px}
.tb-sub{margin:0 0 6px;font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;opacity:.6;font-weight:500}
.tb-plan h3{margin:0 0 6px;font-size:clamp(1.3rem,3.6vmin,2.2rem);font-weight:700;letter-spacing:-.02em;line-height:1.15}
.tb-plan p{margin:0 0 10px;opacity:.6;font-size:clamp(.9rem,2vmin,1.1rem)}
.tb-plan ol{margin:0;padding:0 0 0 1.5em;display:grid;gap:6px;font-weight:300;font-size:clamp(1rem,2.6vmin,1.4rem);line-height:1.3}
.tb-plan li{padding-left:.2em;overflow-wrap:anywhere}
.tb-plan li::marker{opacity:.6}
.tb-compact .tb-plan li:nth-child(n+3),.tb-compact .tb-plan p{display:none}
.tb-l2 .tb-plan{display:none}
.tb-next{list-style:none;margin:0;padding:0;display:grid}
.tb-next li{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 4px;border-bottom:1px solid var(--line)}
.tb-next li:last-child{border-bottom:0}
.tb-ntitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(1rem,2.4vmin,1.25rem)}
.tb-nwhen{flex:none;opacity:.65;font-size:.9rem;font-variant-numeric:tabular-nums}
.tb-more{margin:6px 4px 0;opacity:.55;font-size:.85rem}
.tb-foot{display:grid;gap:2px;font-size:.85rem;opacity:.65;justify-items:start}
.tb-toast{margin:0;padding:10px 14px;border-radius:14px;background:var(--card);border:1px solid var(--line);animation:tb-in .3s both}
.tb-link{background:none;border:0;padding:0;font:inherit;text-decoration:underline;color:inherit;cursor:pointer}
.tb-l2 .tb-next,.tb-l2 .tb-more,.tb-l2 .tb-sub{display:none}.tb-l3 .tb-note,.tb-l3 .tb-foot{display:none}.tb-l3 .tb-title{font-size:1.2rem;-webkit-line-clamp:2}
.tb-l4 .tb-label,.tb-l4 .tb-meta,.tb-l4 .tb-toast{display:none}.tb-l4 .tb-hero{padding:8px 12px 8px 18px;gap:4px}.tb-l4 .tb-title{font-size:1.05rem;-webkit-line-clamp:1}.tb-l4 .tb-done{min-height:36px;margin:0;padding:0 16px;font-size:.95rem}
.tb-compact{gap:10px}
.tb-compact .tb-hero{gap:6px;padding:12px 14px 12px 20px;border-radius:20px}
.tb-compact .tb-title{font-size:1.5rem}.tb-compact .tb-note{display:none}
.tb-compact .tb-done{min-height:44px;padding:0 22px;font-size:1rem}
.tb-compact .tb-next li{min-height:36px}
@keyframes tb-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.tb-hero,.tb-toast{animation:none}.tb-done{transition:none}}
`;

const Check = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const when = (t: DashTask, now: number) => taskTiming(t, now).chip ?? '';

/**
 * The tasks, built to be read from across a room: what to do now, big, with its time and its note and one big button; then what comes after.
 * Calm on purpose: a time that has passed says "nog open", and nothing here counts what you did not do.
 */
export function TaskBoard({ tasks, now: fixed, mode = 'work', waiting = 0, leftOpen = 0, doneToday = 0, onComplete, justDone, onUndo, notes = [], plan = null, compact = false, level = 0, style }: TaskBoardProps) {
  compact = compact || level >= 1;
  const live = useMinute();
  const now = fixed ?? live;
  const hero = tasks.find(t => t.state === 'now') ?? null;
  const rest = tasks.filter(t => t !== hero), max = compact ? 2 : 3, next = rest.slice(0, max), more = rest.length - next.length;
  const timing = hero ? taskTiming(hero, now) : null;
  return (
    <section aria-label="Taken" className={`tb${compact ? ' tb-compact' : ''}${level >= 2 ? ' tb-l2' : ''}${level >= 3 ? ' tb-l3' : ''}${level >= 4 ? ' tb-l4' : ''}`} style={style}>
      <style>{CSS}</style>
      {justDone && (
        <p className="tb-toast" role="status">✓ {justDone.title}{onUndo && <> · <button type="button" className="tb-link" onClick={() => void onUndo()}>Ongedaan maken</button></>}</p>
      )}
      {hero ? (
        <article key={hero.id} className="tb-hero" style={{ ['--cat' as string]: cat(hero.category).color }}>
          <header className="tb-label"><span>Nu doen</span><span className="tb-cat"><span className="tb-dot" aria-hidden="true" />{cat(hero.category).label}</span></header>
          <h2 className="tb-title">{hero.title}</h2>
          {(timing!.chip || timing!.passed) && (
            <div className="tb-meta">
              {timing!.chip && <span className={`tb-chip${timing!.soon ? ' tb-soon' : ''}`}>{timing!.chip}{timing!.soon ? ' (bijna)' : ''}</span>}
              {timing!.passed && <span className="tb-chip tb-quiet">nog open</span>}
            </div>
          )}
          {hero.note && <p className="tb-note">{hero.note}</p>}
          {onComplete && <button type="button" className="tb-done" onClick={() => void onComplete(hero.id)}><Check />Klaar</button>}
        </article>
      ) : (
        <div className="tb-hero"><header className="tb-label"><span>Nu doen</span></header><h2 className="tb-title tb-calm">Niets nu. Rust maar.</h2></div>
      )}
      {plan ? (
        <section className="tb-plan" aria-label={plan.title}>
          <h3>= {plan.title}</h3>
          <p>{plan.lead}</p>
          <ol>{plan.items.map(i => <li key={i}>{i}</li>)}</ol>
        </section>
      ) : next.length > 0 && (
        <div>
          <h3 className="tb-sub">{hero ? 'Daarna' : 'Straks'}</h3>
          <ol className="tb-next">
            {next.map(t => (
              <li key={t.id} style={{ ['--cat' as string]: cat(t.category).color }}>
                <span className="tb-dot" role="img" aria-label={cat(t.category).label} />
                <span className="tb-ntitle">{t.title}</span>
                <span className="tb-nwhen">{when(t, now)}</span>
              </li>
            ))}
          </ol>
          {more > 0 && <p className="tb-more">en nog {more}</p>}
        </div>
      )}
      <footer className="tb-foot">
        {doneToday > 0 && <span>✓ {doneToday} vandaag klaar</span>}
        {leftOpen > 0 && <span>{leftOpen} nog open van eerder</span>}
        {mode === 'free' && waiting > 0 && <span>{waiting === 1 ? '1 werktaak wacht' : `${waiting} werktaken wachten`} tot de volgende werkdag</span>}
        {notes.map(n => <span key={n} role="status">{n}</span>)}
      </footer>
    </section>
  );
}
