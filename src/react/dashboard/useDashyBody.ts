import { useEffect, useRef, type RefObject } from 'react';
import type { DashyState } from '../../core';
import { mountDashy, type DashyHandle } from '../../svg';

/**
 * Makes the `card` element Dashy's body. His eyes are drawn on it, and the movement from core.ts (hop, squash, tilt, shake)
 * is applied to the card. `vars` gets --dbx/--dby so content on top can ride along with the body.
 */
export function useDashyBody(card: RefObject<HTMLElement | null>, vars: RefObject<HTMLElement | null>, state: DashyState, reducedMotion?: boolean) {
  const handle = useRef<DashyHandle | null>(null);
  const latest = useRef(state); latest.current = state;
  useEffect(() => {
    const h = mountDashy(card.current!, { body: { vars: vars.current ?? undefined }, initialState: latest.current, reducedMotion });
    handle.current = h;
    return () => { h.destroy(); handle.current = null; };
  }, [card, vars, reducedMotion]);
  useEffect(() => { const h = handle.current; if (h && h.getState() !== state) h.setState(state); }, [state]);
  return { look: (nx: number, ny: number) => handle.current?.look(nx, ny), getState: () => handle.current?.getState() };
}
