import { useEffect, useState, type CSSProperties } from 'react';
import { duration, isBookingTime } from '../day';
import { DEFAULT_WORKDAY } from '../server/plan';
import type { Hours } from '../tasks';
import type { Workday } from '../day';

export interface HoursPanelProps {
  hours: Hours;
  workday?: Workday;
  /** Fixed time for tests and screenshots. Default: the real time, refreshed every minute. */
  now?: number;
  /** Smaller: the projects on one line. For low screens (a phone on its side). */
  compact?: boolean;
  style?: CSSProperties;
}

const label = (min: number) => duration(min * 60_000);

/**
 * The hours: what you logged today (quietly), and from 15 minutes before the end of the working day what there is to book, per project.
 * Earlier days that were never booked get one calm line. No red, no "you forgot", no total of what is missing over weeks.
 */
export function HoursPanel({ hours, workday = DEFAULT_WORKDAY, now: fixed, compact = false, style }: HoursPanelProps) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const now = fixed ?? tick;
  const booking = isBookingTime(now, workday);
  const open = hours.perProject.filter(p => p.unbookedMin > 0);
  if (hours.totalMin === 0 && hours.olderUnbookedMin === 0) return null;
  return (
    <section aria-label="Uren" style={{ display: 'grid', gap: 8, width: '100%', maxWidth: '26rem', justifyItems: 'center', textAlign: 'center', ...style }}>
      {hours.totalMin > 0 && !(booking && hours.unbookedMin > 0) && <p style={{ margin: 0, fontSize: '.85rem', opacity: 0.7 }}>Uren vandaag: <strong>{label(hours.totalMin)}</strong></p>}
      {booking && hours.unbookedMin > 0 && compact && (
        <p role="status" style={{ margin: 0, fontSize: '.85rem' }}>
          <strong>Tijd om te boeken: {label(hours.unbookedMin)}</strong>
          <span style={{ display: 'block', opacity: 0.75 }}>{open.map(p => `${p.project ?? 'Zonder project'} ${label(p.unbookedMin)}`).join(' · ')}</span>
        </p>
      )}
      {booking && hours.unbookedMin > 0 && !compact && (
        <div role="status" style={{ width: '100%', padding: '10px 14px', borderRadius: 16, border: '1.5px solid var(--line)', fontSize: '.9rem' }}>
          <strong>Tijd om je uren te boeken</strong>
          <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
            {open.map(p => <li key={p.project ?? '—'} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{p.project ?? 'Zonder project'}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{label(p.unbookedMin)}</span></li>)}
          </ul>
          {open.length > 1 && <p style={{ margin: '6px 0 0', opacity: 0.7, fontSize: '.8rem' }}>Samen {label(hours.unbookedMin)}</p>}
        </div>
      )}
      {hours.olderUnbookedMin > 0 && <p style={{ margin: 0, fontSize: '.8rem', opacity: 0.6 }}>Nog te boeken van eerder: {label(hours.olderUnbookedMin)}</p>}
    </section>
  );
}
