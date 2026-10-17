/**
 * The moments of the day, as a short briefing in the screen: a fresh plan in the morning (three things at most), a nudge in the afternoon,
 * a check-in in the evening, and from the wind-down time on what tomorrow starts with. Pure: it only knows what is on the dashboard
 * (what you told it) and, for the evening, the one line you set for yourself. Calm on purpose: nothing counts what you did not do.
 */
import { clockParts } from './clock';
import { nowTask, type DashboardSnapshot } from './tasks';
import { DEFAULT_WINDDOWN, isWindDown } from './winddown';

export type BriefingKind = 'morning' | 'midday' | 'evening' | 'night';
export interface Briefing { kind: BriefingKind; title: string; lead: string; items: string[] }
export interface BriefingOptions {
  /** Minutes after midnight when winding down starts; null = no night briefing. Default 22:30. */
  windDownMin?: number | null;
  /** Your own one thing for tonight (from "Even lastig"). */
  evening?: string;
}

const hhmm = (at: number) => clockParts(at).time;
const line = (t: { title: string; when: string }) => (t.when ? `${t.title} · ${t.when}` : t.title);

export function briefingKind(now: number, windDownMin: number | null = DEFAULT_WINDDOWN): BriefingKind | null {
  if (isWindDown(now, windDownMin)) return 'night';
  const h = clockParts(now).hour;
  // without a wind-down time the old hours hold: quiet from 23:00 until 05:00
  return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'midday' : h >= 17 && h < (windDownMin === null ? 23 : 24) ? 'evening' : null;
}

export function briefing(s: DashboardSnapshot | null, now: number, o: BriefingOptions = {}): Briefing | null {
  const kind = briefingKind(now, o.windDownMin === undefined ? DEFAULT_WINDDOWN : o.windDownMin);
  if (!s || !kind) return null;
  const open = s.tasks, done = s.doneToday, hero = nowTask(s);
  const appt = s.appointment && s.appointment.at > now && clockParts(s.appointment.at).iso.slice(0, 10) === clockParts(now).iso.slice(0, 10) ? s.appointment : null;
  let lead: string, title: string, items: string[], max = 4;
  if (kind === 'morning') {
    max = 3; title = 'ochtendplan'; lead = 'een nieuwe dag, een schoon begin. dit staat er:';
    items = [...(appt ? [`${hhmm(appt.at)} ${appt.title}`] : []), ...open.map(line)];
    if (s.leftOpen.length) items.push(`${s.leftOpen.length} nog open van eerder, kies zelf wanneer`);
  } else if (kind === 'midday') {
    title = 'middagduwtje';
    lead = done > 0 ? `${done} klaar vandaag. rustig verder:` : 'nog niets afgevinkt, dat mag. kies één klein ding:';
    items = [...(appt ? [`${hhmm(appt.at)} ${appt.title}`] : []), ...open.slice(0, 2).map(line)];
  } else if (kind === 'evening') {
    title = 'avondcheck';
    lead = done > 0 ? `${done} ${done === 1 ? 'ding' : 'dingen'} klaar vandaag. dat telt.` : 'een rustige dag. dat is ook goed.';
    items = [
      o.evening ? `vanavond: ${o.evening}` : s.mode === 'free' ? 'kies één ding voor vanavond, een lege avond is zwaarder' : '',
      ...(s.hours.unbookedMin > 0 && s.mode === 'work' ? ['uren boeken, dan is het klaar'] : []),
      ...open.filter(t => t !== hero).slice(0, 3).map(t => `straks: ${line(t)}`),
    ].filter(Boolean);
  } else {
    title = 'tot morgen';
    const first = open[0];
    lead = first ? 'rust maar, de rest kan morgen. je begint met:' : 'morgen staat leeg. rust maar.';
    items = first ? [first.step ? `${first.title}, eerste stap: ${first.step}` : first.title] : [];
    return { kind, title, lead, items };
  }
  if (!items.length) return null;
  if (items.length > max) { const extra = items.length - (max - 1); items = [...items.slice(0, max - 1), `en nog ${extra}`]; }
  return { kind, title, lead, items };
}
