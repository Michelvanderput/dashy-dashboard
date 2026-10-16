import { useEffect, useRef, type CSSProperties } from 'react';
import type { DashyState, Shape } from '../core';
import { DEFAULT_LABELS, mountDashy, type DashyHandle, type MountOptions } from '../svg';

export interface DashyProps {
  state?: DashyState;
  shape?: Shape;
  /** Pixels (number) or any CSS length. The avatar is square. Default 96. */
  size?: number | string;
  /** Screen reader texts per state. Read when Dashy mounts. Default: Dutch. */
  labels?: MountOptions['labels'];
  /** Also announce state changes to screen readers (polite). Default false: the label is on the image itself. */
  announce?: boolean;
  /** Force reduced motion. Default: follow the system setting. */
  reducedMotion?: boolean;
  /** Seed for blink timing and glances. Read when Dashy mounts. */
  seed?: number;
  className?: string;
  style?: CSSProperties;
}

const SR_ONLY: CSSProperties = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

/** Dashy as a React component. All motion comes from core.ts; this only mounts it and passes props through. */
export function Dashy({ state = 'idle', shape = 'square', size = 96, labels, announce = false, reducedMotion, seed, className, style }: DashyProps) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<DashyHandle | null>(null);
  const latest = useRef({ state, shape, labels });
  latest.current = { state, shape, labels };

  // Mount once (and again only if reducedMotion or seed change). labels are read from `latest`, so an inline object does not remount.
  useEffect(() => {
    const h = mountDashy(host.current!, { ...latest.current, initialState: latest.current.state, reducedMotion, seed });
    handle.current = h;
    return () => { h.destroy(); handle.current = null; };
  }, [reducedMotion, seed]);

  useEffect(() => { const h = handle.current; if (h && h.getState() !== state) h.setState(state); }, [state]);
  useEffect(() => { handle.current?.setShape(shape); }, [shape]);

  const dim = typeof size === 'number' ? `${size}px` : size;
  const text = { ...DEFAULT_LABELS, ...labels }[state];
  return (
    <div ref={host} className={className} style={{ position: 'relative', display: 'inline-block', width: dim, height: dim, ...style }}>
      {announce && <span aria-live="polite" style={SR_ONLY}>{text}</span>}
    </div>
  );
}
