import { useEffect, useRef, useState } from 'react';
import { BREATH, breath, closing, distractionFor, urgeLeft, type UrgeOutcome } from '../../dashboard/urge';
import { timerLabel } from '../../dashboard/session';

const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * "Even stoppen": full-screen calm sheet. A ten-minute pause, slow breathing and something else to do. It never asks what the
 * urge is about, never counts, never judges. Esc or "Sluiten" leaves at any time.
 */
export function UrgeSheet({ onClose }: { onClose: (outcome: UrgeOutcome) => void }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [tip, setTip] = useState(0);
  const [done, setDone] = useState<UrgeOutcome | null>(null);
  const reduced = useRef(prefersReduced()).current;
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), reduced ? 1000 : 100);
    const opener = document.activeElement as HTMLElement | null;
    first.current?.focus();
    return () => { clearInterval(t); opener?.focus?.(); };
  }, [reduced]);

  const finish = (o: UrgeOutcome) => { setDone(o); };
  const left = urgeLeft(startedAt, now);
  const b = breath(now - startedAt);

  return (
    <div className="db-urge" role="dialog" aria-modal="true" aria-labelledby="db-urge-title"
      onKeyDown={e => { if (e.key === 'Escape') (done ? onClose(done) : finish('gestopt')); }}>
      {done ? (
        <div className="db-urge-in">
          <h2 id="db-urge-title">Even stoppen</h2>
          <p className="db-urge-say">{closing(done)}</p>
          <button ref={first} type="button" className="db-urge-btn" onClick={() => onClose(done)}>Terug naar je dag</button>
        </div>
      ) : (
        <div className="db-urge-in">
          <h2 id="db-urge-title">Even stoppen</h2>
          <p className="db-urge-say">{left > 0 ? 'Een drang gaat voorbij. Je hoeft nu niets te beslissen.' : 'Tien minuten voorbij. Hoe gaat het?'}</p>
          <div className="db-urge-breath" aria-hidden="true">
            <i style={reduced ? undefined : { transform: `scale(${(0.55 + 0.45 * b.fill).toFixed(3)})` }} />
            <span>{b.label}</span>
          </div>
          <p className="db-urge-time" role="timer" aria-live="off"><span className="db-sr">Nog </span>{timerLabel(left)}</p>
          <p className="db-urge-tip"><b>Doe iets anders: </b>{distractionFor(tip)} <button type="button" className="db-urge-link" onClick={() => setTip(t => t + 1)}>Andere</button></p>
          <div className="db-urge-row">
            <button ref={first} type="button" className="db-urge-btn" onClick={() => finish('overleefd')}>Het gaat voorbij</button>
            <button type="button" className="db-urge-btn ghost" onClick={() => finish('gebeurd')}>Het is gebeurd</button>
            <button type="button" className="db-urge-btn ghost" onClick={() => finish('gestopt')}>Sluiten</button>
          </div>
          <p className="db-urge-foot">Ademritme: {BREATH.inMs / 1000} seconden in, {BREATH.outMs / 1000} uit. Dit is geen medische hulp: blijft het zwaar, praat dan met je huisarts.</p>
        </div>
      )}
    </div>
  );
}
