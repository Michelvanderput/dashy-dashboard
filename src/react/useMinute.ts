import { useEffect, useState } from 'react';
import { msToNextMinute } from '../clock';

/** The real time, ticking exactly when the minute changes (and again when the window comes back, since timers sleep in the background). */
export function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { const t = Date.now(); setNow(t); clearTimeout(timer); timer = setTimeout(tick, msToNextMinute(t)); };
    timer = setTimeout(tick, msToNextMinute(Date.now()));
    document.addEventListener('visibilitychange', tick); window.addEventListener('focus', tick);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, []);
  return now;
}

