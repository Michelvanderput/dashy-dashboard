import { useEffect, useRef, useState, type RefObject } from 'react';
import { CALM_FOCUS, WINDOWS, nextFocus, type Candidate, type FocusState, type Pin } from '../../dashboard/attention';
import { orientationOf, type BlockId, type Orientation } from '../../dashboard/layout';

/** A clock that ticks (default every second) and stops while the window is hidden. */
export function useNow(ms = 1000, clock: () => number = Date.now): number {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) setNow(clock()); }, ms);
    const onVis = () => { if (!document.hidden) setNow(clock()); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [ms, clock]);
  return now;
}

/** Portrait or landscape, from the size of the element itself. */
export function useOrientation(ref: RefObject<HTMLElement | null>): Orientation {
  const [o, setO] = useState<Orientation>('landscape');
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const read = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setO(orientationOf(r.width, r.height)); };
    read();
    if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(read); ro.observe(el); return () => ro.disconnect(); }
    window.addEventListener('resize', read); return () => window.removeEventListener('resize', read);
  }, [ref]);
  return o;
}

/** The block in focus: what needs attention, unless the person chose one. Re-evaluated every tick. */
export function useFocus(candidate: Candidate | null, now: number) {
  const [focus, setFocus] = useState<FocusState>(CALM_FOCUS);
  const [pin, setPin] = useState<Pin | null>(null);
  const nowRef = useRef(now); nowRef.current = now;
  const key = candidate ? `${candidate.block}|${candidate.reason}|${candidate.priority}|${candidate.holdMs}` : '';
  useEffect(() => { setFocus(prev => nextFocus(prev, candidate, pin, now)); }, [key, pin, now]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    focus,
    pinned: focus.pinned ? focus.block : null,
    /** Tap on a block: grow it for 10 minutes; tap again to let go. */
    toggle: (b: BlockId) => setPin(p => (p && p.block === b && p.until > nowRef.current ? null : { block: b, until: nowRef.current + WINDOWS.pinMs })),
    release: () => setPin(null),
  };
}
