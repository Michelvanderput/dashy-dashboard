import { useEffect, useState, type CSSProperties } from 'react';
import { appointmentView, dayProgress, duration, positionOnDay, type Workday } from '../day';
import { DEFAULT_WORKDAY } from '../server/plan';

export interface DayPanelProps {
  /** The next appointment, epoch ms. */
  appointment?: { title: string; at: number; endsAt?: number | null } | null;
  workday?: Workday;
  /** Fixed time for tests and screenshots. Default: the real time, refreshed every 30 s. */
  now?: number;
  style?: CSSProperties;
}

/** The real time, refreshed on an interval (and when the window comes back, since timers sleep in the background). */
function useNow(every = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, every);
    document.addEventListener('visibilitychange', tick); window.addEventListener('focus', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, [every]);
  return now;
}

const ORANGE = '#d9730d';
const hm = (ms: number) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });

/**
 * The day at a glance: the next appointment with a countdown (orange under ten minutes), and a bar for how far through the working day you are.
 * Calm on purpose: no percentages shouted, no "behind schedule", and nothing at all on a day off.
 */
export function DayPanel({ appointment, workday = DEFAULT_WORKDAY, now: fixed, style }: DayPanelProps) {
  const live = useNow();
  const now = fixed ?? live;
  const day = dayProgress(now, workday);
  const appt = appointment ? appointmentView({ ...appointment, endsAt: appointment.endsAt ?? null }, now) : null;
  const marker = appointment ? positionOnDay(day, appointment.at) : null;
  if (!appt && day.phase === 'free') return null;

  const pct = Math.round(day.fraction * 100);
  const bar = day.phase === 'free' ? null : (
    <div>
      <div role="progressbar" aria-label="Werkdag" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={dayText(day.phase, day.leftMs, workday)}
        style={{ position: 'relative', height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'visible' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: 'var(--ink)', opacity: day.phase === 'after' ? 0.35 : 0.85, transition: 'width 1s linear' }} />
        {marker !== null && <span aria-hidden="true" title={appointment!.title} style={{ position: 'absolute', top: -4, left: `calc(${marker * 100}% - 2px)`, width: 4, height: 16, borderRadius: 2, background: appt?.soon ? ORANGE : 'var(--ink)' }} />}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: '.8rem', opacity: 0.7 }}>{dayText(day.phase, day.leftMs, workday)}</p>
    </div>
  );

  return (
    <section aria-label="Je dag" style={{ display: 'grid', gap: 10, width: '100%', maxWidth: '26rem', ...style }}>
      {appt && appointment && (
        <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline', justifyContent: 'center', fontSize: '.95rem' }}>
          <span style={{ opacity: 0.6, fontSize: '.8rem' }}>{appt.phase === 'now' ? 'Nu' : 'Volgende afspraak'}</span>
          <strong>{appointment.title}</strong>
          <span style={{ padding: '1px 9px', borderRadius: 999, border: `1.5px solid ${appt.soon ? ORANGE : 'var(--line)'}`, fontVariantNumeric: 'tabular-nums' }}>
            {appt.text}{appt.phase === 'upcoming' && appt.leftMs > 0 && appt.text.startsWith('over') ? ` · ${hm(appointment.at)}` : ''}{appt.soon ? ' (bijna)' : ''}
          </span>
        </p>
      )}
      {bar}
    </section>
  );
}

function dayText(phase: ReturnType<typeof dayProgress>['phase'], leftMs: number, w: Workday): string {
  if (phase === 'before') return `Werkdag begint om ${w.start}`;
  if (phase === 'after') return 'Werkdag voorbij';
  return `Nog ${duration(leftMs)} tot ${w.end}`;
}
