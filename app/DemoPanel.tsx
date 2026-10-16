import { useState } from 'react';

export interface DemoActions {
  deadline: (minutes: number) => void; appointment: (minutes: number) => void; finishFirst: () => void;
  music: () => void; nextTrack: () => void; flag: (f: 'waiting' | 'blocked' | 'break') => void; reset: () => void;
  state: { music: boolean; waiting: boolean; blocked: boolean; onBreak: boolean };
}

const css = `
.dp{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:10;font:13px system-ui,sans-serif;color:#17181a}
@media (prefers-color-scheme:dark){.dp{color:#f0efeb}}
.dp-toggle,.dp button.b{font:inherit;color:inherit;border:1px solid rgba(127,127,127,.35);background:color-mix(in srgb,Canvas 92%,transparent);backdrop-filter:blur(10px);border-radius:999px;padding:0 14px;min-height:44px;cursor:pointer}
.dp-panel{position:absolute;right:0;bottom:52px;width:min(320px,calc(100vw - 24px));padding:12px;border-radius:20px;border:1px solid rgba(127,127,127,.3);background:color-mix(in srgb,Canvas 94%,transparent);backdrop-filter:blur(14px);display:grid;gap:8px;box-shadow:0 20px 50px -20px rgba(0,0,0,.5)}
.dp-panel p{margin:0;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;opacity:.6}
.dp-row{display:flex;flex-wrap:wrap;gap:6px}.dp button.b{padding:0 12px;min-height:40px}.dp button[aria-pressed="true"]{background:#17181a;color:#fff}
@media (prefers-color-scheme:dark){.dp button[aria-pressed="true"]{background:#f0efeb;color:#111}}
`;

/** Try every situation without waiting: this only exists in the demo. */
export function DemoPanel({ a }: { a: DemoActions }) {
  const [open, setOpen] = useState(false);
  const B = ({ onClick, children, on }: { onClick: () => void; children: string; on?: boolean }) => <button type="button" className="b" aria-pressed={on} onClick={onClick}>{children}</button>;
  return (
    <div className="dp"><style>{css}</style>
      {open && (
        <div className="dp-panel" role="group" aria-label="Demo-bediening">
          <p>Deadline</p><div className="dp-row"><B onClick={() => a.deadline(50)}>over 50 min</B><B onClick={() => a.deadline(10)}>over 10 min</B><B onClick={a.finishFirst}>Taak afvinken</B></div>
          <p>Agenda</p><div className="dp-row"><B onClick={() => a.appointment(8)}>Afspraak over 8 min</B></div>
          <p>Muziek</p><div className="dp-row"><B on={a.state.music} onClick={a.music}>{a.state.music ? 'Muziek uit' : 'Muziek aan'}</B><B onClick={a.nextTrack}>Volgend nummer</B></div>
          <p>Dashy</p><div className="dp-row"><B on={a.state.waiting} onClick={() => a.flag('waiting')}>Wacht op mij</B><B on={a.state.blocked} onClick={() => a.flag('blocked')}>Vastgelopen</B><B on={a.state.onBreak} onClick={() => a.flag('break')}>Pauze</B></div>
          <div className="dp-row"><B onClick={a.reset}>Alles terug naar rustig</B></div>
        </div>
      )}
      <button type="button" className="dp-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Sluit demo' : 'Demo'}</button>
    </div>
  );
}
