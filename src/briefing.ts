/**
 * The three moments of the day, as a short briefing in the screen: a plan in the morning, a nudge in the afternoon, a check-in in the evening.
 * Pure: it only knows what is on the dashboard (what you told it). Calm on purpose: nothing counts what you did not do.
 */
import { clockParts } from './clock';
import { nowTask, type DashboardSnapshot } from './tasks';

export type BriefingKind = 'morning' | 'midday' | 'evening';
export interface Briefing { kind: BriefingKind; title: string; lead: string; items: string[] }

const MAX = 4;
const hhmm = (at: number) => clockParts(at).time;
const line = (t: { title: string; when: string }) => (t.when ? `${t.title} · ${t.when}` : t.title);

export function briefingKind(now: number): BriefingKind | null {
  const h = clockParts(now).hour;
  return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'midday' : h >= 17 && h < 23 ? 'evening' : null;
}

export function briefing(s: DashboardSnapshot | null, now: number): Briefing | null {
  const kind = briefingKind(now);
  if (!s || !kind) return null;
  const open = s.tasks, done = s.doneToday;
  const appt = s.appointment && s.appointment.at > now && clockParts(s.appointment.at).iso.slice(0, 10) === clockParts(now).iso.slice(0, 10) ? s.appointment : null;
  let lead: string, title: string, items: string[];
  if (kind === 'morning') {
    title = 'ochtendplan'; lead = 'dit staat er vandaag:';
    items = [...(appt ? [`${hhmm(appt.at)} ${appt.title}`] : []), ...open.map(line)];
    if (s.leftOpen.length) items.push(`${s.leftOpen.length} nog open van eerder, kies zelf wanneer`);
  } else if (kind === 'midday') {
    title = 'middagduwtje';
    lead = done > 0 ? `${done} klaar vandaag. rustig verder:` : 'nog niets afgevinkt, dat mag. kies één klein ding:';
    items = [...(appt ? [`${hhmm(appt.at)} ${appt.title}`] : []), ...open.slice(0, 2).map(line)];
  } else {
    title = 'avondcheck';
    lead = done > 0 ? `${done} ${done === 1 ? 'ding' : 'dingen'} klaar vandaag. dat telt.` : 'een rustige dag. dat is ook goed.';
    items = [...(s.hours.unbookedMin > 0 && s.mode === 'work' ? ['uren boeken, dan is het klaar'] : []), ...open.filter(t => t !== nowTask(s)).slice(0, 3).map(t => `straks: ${line(t)}`)];
  }
  if (!items.length) return null;
  if (items.length > MAX) { const extra = items.length - (MAX - 1); items = [...items.slice(0, MAX - 1), `en nog ${extra}`]; }
  return { kind, title, lead, items };
}
