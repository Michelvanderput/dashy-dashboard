import type { CSSProperties } from 'react';
import { clockParts } from '../clock';
import { useMinute } from './useMinute';

export interface ClockProps {
  /** Fixed time for tests and screenshots. Default: the real time, updated on the minute. */
  now?: number;
  /** Smaller, for a low screen. */
  compact?: boolean;
  style?: CSSProperties;
}

/** The time big, with the date and the week number under it. Minutes only: nothing in it moves every second. */
export function Clock({ now: fixed, compact = false, style }: ClockProps) {
  const live = useMinute();
  const c = clockParts(fixed ?? live);
  return (
    <div style={{ display: 'grid', gap: compact ? 0 : 2, ...style }}>
      <time dateTime={c.iso} style={{ fontSize: compact ? 'clamp(2.2rem, 11vh, 3.2rem)' : 'clamp(3.2rem, 11vmin, 6.5rem)', fontWeight: 300, lineHeight: 1, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}>{c.time}</time>
      <p style={{ margin: 0, fontSize: compact ? '.9rem' : 'clamp(1rem, 2.6vmin, 1.5rem)' }}>
        {c.date.charAt(0).toUpperCase() + c.date.slice(1)}<span style={{ opacity: 0.55 }}> · week {c.week}</span>
      </p>
    </div>
  );
}
