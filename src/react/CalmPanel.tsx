import { useEffect, useRef, useState } from 'react';
import { planFromText, waveView, type CalmPlan } from '../calm';

export interface CalmPanelProps {
  plan: CalmPlan;
  onSavePlan: (p: CalmPlan) => void;
  /** When the current quiet quarter of an hour started, or null. */
  waveStart: number | null;
  onRestartWave: () => void;
  /** Close, and say you are through it. */
  onClose: () => void;
  /** Fixed time for tests. */
  now?: number;
}

const CSS = `
.cp{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:clamp(16px,4vmin,40px);background:var(--bg);color:var(--ink);overflow:auto;animation:cp-in .4s both}
.cp-in{display:grid;gap:clamp(12px,2.4vmin,22px);width:min(34rem,100%);justify-items:center;text-align:center}
.cp h2{margin:0;font-size:clamp(1.3rem,3.6vmin,2rem);font-weight:700;letter-spacing:-.02em}
.cp-breath{position:relative;width:clamp(120px,26vmin,200px);aspect-ratio:1;display:grid;place-items:center}
.cp-breath::before{content:"";position:absolute;inset:0;border-radius:50%;background:color-mix(in srgb,var(--ink) 12%,transparent);animation:cp-breathe 10s ease-in-out infinite}
.cp-time{position:relative;font-size:clamp(1.6rem,5vmin,2.6rem);font-weight:300;font-variant-numeric:tabular-nums}
.cp-msg{margin:0;font-size:clamp(1rem,2.4vmin,1.3rem);opacity:.85;max-width:28rem}
.cp-plan{text-align:left;justify-self:stretch;display:grid;gap:6px}
.cp-plan h3{margin:0;font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;opacity:.6;font-weight:500}
.cp-plan ol{margin:0;padding:0 0 0 1.5em;display:grid;gap:4px;font-weight:300;font-size:clamp(1rem,2.4vmin,1.3rem);line-height:1.3}
.cp-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.cp-main,.cp-ghost{min-height:48px;padding:0 24px;border-radius:999px;font:inherit;font-weight:600;cursor:pointer}
.cp-main{border:0;background:var(--ink);color:var(--bg)}.cp-ghost{border:1.5px solid var(--line);background:none;color:inherit;font-weight:500}
.cp button:focus-visible,.cp textarea:focus-visible,.cp input:focus-visible{outline:3px solid var(--ink);outline-offset:3px}
.cp-small{margin:0;font-size:.8rem;opacity:.6}
.cp label{display:grid;gap:6px;text-align:left;justify-self:stretch;font-size:.95rem}
.cp textarea,.cp input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--card);color:inherit;font:inherit}
@keyframes cp-breathe{0%,100%{transform:scale(.72)}40%{transform:scale(1)}}
@keyframes cp-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.cp,.cp-breath::before{animation:none}.cp-breath::before{transform:scale(.9)}}
@media (max-height:520px){.cp-breath{width:84px}.cp-msg{font-size:.95rem}}
`;

/**
 * "Even lastig": a quiet quarter of an hour with your own plan next to it. Never touches a server: the plan stays on this device.
 * The first time (no plan yet) it asks you to write one while you are fine, because that is the plan you can follow when it is hard.
 */
export function CalmPanel({ plan, onSavePlan, waveStart, onRestartWave, onClose, now: fixed }: CalmPanelProps) {
  const [editing, setEditing] = useState(plan.lines.length === 0);
  const [lines, setLines] = useState(plan.lines.join('\n')), [evening, setEvening] = useState(plan.evening);
  const [tick, setTick] = useState(() => fixed ?? Date.now());
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (fixed !== undefined) return; const id = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(id); }, [fixed]);
  useEffect(() => { closeRef.current?.focus(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const w = waveStart !== null ? waveView(waveStart, fixed ?? tick) : null;

  return (
    <div className="cp" role="dialog" aria-modal="true" aria-label="Even lastig">
      <style>{CSS}</style>
      <div className="cp-in">
        {editing ? (
          <form className="cp-in" style={{ width: '100%' }} onSubmit={e => { e.preventDefault(); onSavePlan(planFromText(lines, evening)); setEditing(false); }}>
            <h2>Mijn plan</h2>
            <p className="cp-msg">Schrijf nu, op een rustig moment, wat je doet als het lastig wordt. Dat is het plan dat je dan kunt volgen.</p>
            <label>Als het lastig wordt, dan… (één ding per regel)
              <textarea value={lines} onChange={e => setLines(e.target.value)} rows={5} maxLength={600} placeholder={'Een kwartier naar buiten lopen\nEen glas water en iets eten\nMuziek aan en de afwas doen'} />
            </label>
            <label>Mijn ene ding voor vanavond
              <input value={evening} onChange={e => setEvening(e.target.value)} maxLength={120} placeholder="Bijvoorbeeld: gitaar spelen" />
            </label>
            <div className="cp-actions">
              <button type="submit" className="cp-main">Opslaan</button>
              {plan.lines.length > 0 && <button type="button" className="cp-ghost" onClick={() => { setLines(plan.lines.join('\n')); setEvening(plan.evening); setEditing(false); }}>Terug</button>}
            </div>
            <p className="cp-small">Dit blijft op dit apparaat. Het gaat nergens heen, ook niet naar Claude.</p>
          </form>
        ) : (
          <>
            <h2>Even lastig</h2>
            {w && (
              <>
                <div className="cp-breath" aria-hidden="true"><span className="cp-time">{w.over ? '' : w.mmss}</span></div>
                <p className="cp-msg" role="status">{w.message}</p>
              </>
            )}
            <div className="cp-plan">
              <h3>Mijn plan</h3>
              <ol>{plan.lines.map(l => <li key={l}>{l}</li>)}</ol>
            </div>
            <div className="cp-actions">
              <button ref={closeRef} type="button" className="cp-main" onClick={onClose}>Ik ben er doorheen</button>
              <button type="button" className="cp-ghost" onClick={onRestartWave}>Nog een kwartier</button>
              <button type="button" className="cp-ghost" onClick={() => setEditing(true)}>Plan aanpassen</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
