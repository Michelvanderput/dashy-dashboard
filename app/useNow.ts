import { useEffect, useState } from 'react';

/** A clock that ticks and stops while the window is hidden. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
