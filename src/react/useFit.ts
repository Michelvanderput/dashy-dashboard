import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * A dashboard never scrolls, so a block that does not fit has to get smaller. Returns a level (0 = everything, higher = less) and a ref for the
 * block's box: whenever the box or `key` changes it starts again at 0 and goes up one level at a time until the content fits (or `max` is reached).
 */
export function useFit<T extends HTMLElement>(max: number, key: unknown): { ref: RefObject<T>; level: number } {
  const ref = useRef<T>(null);
  const [level, setLevel] = useState(0);
  const [size, setSize] = useState('');
  useLayoutEffect(() => { setLevel(0); }, [key, size]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && level < max && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) setLevel(level + 1);
  });
  useEffect(() => { // also on the window, because a block that was hidden has no box to watch
    const f = () => setSize(`${innerWidth}x${innerHeight}`);
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setSize(`${el.clientWidth}x${el.clientHeight}|${innerWidth}x${innerHeight}`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, level };
}
