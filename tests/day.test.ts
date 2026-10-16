import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appointmentView, dayProgress, duration, positionOnDay, SOON_MS } from '../src/day';
import { DEFAULT_WORKDAY, parseWorkday, buildState } from '../src/server/plan';
import { workdayFromEnv } from '../src/server/env';
import { zonedToEpoch } from '../src/server/time';
import { parseDashboard, snapshotEvents } from '../src/tasks';
import { initialDriverState, reduce, resolve } from '../src/driver';
import { TASK_DRIVER_CONFIG } from '../src/tasks';

const at = (d: string, t: string) => { const [y, m, da] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number); return zonedToEpoch(y, m, da, h, mi)!; };
const FRI = '2026-10-16', SAT = '2026-10-17';

test('workday: before, during (with the fraction and what is left), after, and a day off', () => {
  const p = (d: string, t: string) => dayProgress(at(d, t));
  assert.equal(p(FRI, '07:00').phase, 'before');
  assert.equal(p(FRI, '08:29').phase, 'before'); assert.equal(p(FRI, '08:30').phase, 'during');
  const mid = p(FRI, '12:45'); assert.equal(mid.phase, 'during'); assert.ok(Math.abs(mid.fraction - 0.5) < 1e-9, String(mid.fraction)); assert.equal(mid.leftMs, 4.25 * 3600_000);
  assert.equal(p(FRI, '16:59').phase, 'during'); assert.equal(p(FRI, '17:00').phase, 'after'); assert.equal(p(FRI, '23:59').fraction, 1);
  assert.equal(p(SAT, '12:00').phase, 'free'); assert.equal(p('2026-10-18', '09:00').phase, 'free');
  assert.equal(dayProgress(at(SAT, '12:00'), { ...DEFAULT_WORKDAY, days: [0, 1, 2, 3, 4, 5, 6] }).phase, 'during', 'the days are configurable');
});
test('workday: a day with a clock change still has the right start and end', () => {
  // Monday 2026-03-30 is the day after the clocks went forward: 08:30 is still 08:30 on the wall
  const d = dayProgress(at('2026-03-30', '12:00')); assert.equal(d.phase, 'during'); assert.equal(d.end - d.start, 8.5 * 3600_000);
});
test('duration: rounds up so it never says 0 while there is time', () => {
  assert.equal(duration(0), 'minder dan 1 min'); assert.equal(duration(-5), 'minder dan 1 min'); assert.equal(duration(1), '1 min'); assert.equal(duration(59_000), '1 min'); assert.equal(duration(60_000), '1 min');
  assert.equal(duration(25 * 60_000), '25 min'); assert.equal(duration(60 * 60_000), '1 u'); assert.equal(duration(65 * 60_000), '1 u 5 min'); assert.equal(duration(200 * 60_000), '3 u 20 min');
});
test('appointment: countdown, soon under ten minutes, now with the time left, gone when over, a later day by name', () => {
  const NOW = at(FRI, '10:00'), a = { title: 'Standup', at: at(FRI, '10:25'), endsAt: at(FRI, '10:55') };
  assert.deepEqual(appointmentView(a, NOW), { phase: 'upcoming', leftMs: 25 * 60_000, soon: false, text: 'over 25 min' });
  const s = appointmentView(a, at(FRI, '10:15'))!; assert.equal(s.soon, true); assert.equal(s.text, 'over 10 min'); assert.equal(appointmentView(a, at(FRI, '10:14'))!.soon, false);
  assert.equal(SOON_MS, 600_000);
  assert.deepEqual(appointmentView(a, at(FRI, '10:30')), { phase: 'now', leftMs: 25 * 60_000, soon: false, text: 'nog 25 min' });
  assert.equal(appointmentView(a, at(FRI, '10:55')), null); assert.equal(appointmentView(a, at(FRI, '12:00')), null);
  const open = { title: 'x', at: at(FRI, '10:25') }; // no end time: over the moment it starts (the server drops it then too)
  assert.equal(appointmentView(open, at(FRI, '10:24'))!.text, 'over 1 min'); assert.equal(appointmentView(open, at(FRI, '10:25')), null);
  assert.equal(appointmentView({ title: 'Oma', at: at(SAT, '09:00') }, NOW)!.text, 'morgen 09:00');
});
test('appointment position on the day bar', () => {
  const d = dayProgress(at(FRI, '10:00'));
  assert.ok(Math.abs(positionOnDay(d, at(FRI, '12:45'))! - 0.5) < 1e-9); assert.equal(positionOnDay(d, at(FRI, '08:00')), null); assert.equal(positionOnDay(d, at(FRI, '18:00')), null);
  assert.equal(positionOnDay(dayProgress(at(SAT, '10:00')), at(SAT, '12:00')), null, 'no bar on a day off');
});
test('workday setting: parsed from text, anything odd gives the default', () => {
  assert.deepEqual(parseWorkday('09:00-18:30'), { start: '09:00', end: '18:30', days: [1, 2, 3, 4, 5] });
  assert.deepEqual(parseWorkday(' 8:30 - 17:00 '), { start: '08:30', end: '17:00', days: [1, 2, 3, 4, 5] });
  for (const bad of [undefined, '', 'nine to five', '17:00-08:30', '09:00-09:00', '25:00-26:00', '09:00']) assert.deepEqual(parseWorkday(bad), DEFAULT_WORKDAY, String(bad));
  assert.equal(workdayFromEnv({ DASHY_WORKDAY: '07:00-15:00' }).end, '15:00'); assert.deepEqual(workdayFromEnv({}), DEFAULT_WORKDAY);
});
test('the state carries the workday and the appointment, and the client reads both', () => {
  const NOW = at(FRI, '10:00');
  const body = buildState([], { title: 'Standup', at: at(FRI, '10:25'), endsAt: at(FRI, '10:55') }, NOW, undefined, parseWorkday('09:00-17:30'));
  assert.deepEqual(body.workday, { start: '09:00', end: '17:30', days: [1, 2, 3, 4, 5] });
  const snap = parseDashboard(JSON.stringify(body));
  assert.equal(snap.appointment!.title, 'Standup'); assert.equal(snap.appointment!.endsAt, at(FRI, '10:55')); assert.equal(snap.workday.start, '09:00');
  // missing or broken pieces fall back, nothing throws
  const bare = parseDashboard({ v: 2, today: FRI, now: NOW, tasks: [] }); assert.equal(bare.appointment, null); assert.deepEqual(bare.workday, DEFAULT_WORKDAY);
  const broken = parseDashboard({ v: 2, today: FRI, now: NOW, tasks: [], appointment: { title: 5, at: 'x' }, workday: { start: '25:00', end: '1', days: ['a'] } });
  assert.equal(broken.appointment, null); assert.deepEqual(broken.workday, DEFAULT_WORKDAY);
  assert.equal(parseDashboard({ v: 2, today: FRI, now: NOW, tasks: [], appointment: { title: 'x', at: 10, endsAt: 5 } }).appointment!.endsAt, null, 'an end before the start is ignored');
});
test('an appointment makes Dashy strict shortly before it, never angry, and calm after', () => {
  const NOW = at(FRI, '10:00'), snap = (appt: object | null) => parseDashboard({ v: 2, today: FRI, now: NOW, tasks: [], appointment: appt });
  const a = snap({ title: 'Standup', at: at(FRI, '11:00') });
  const ev = snapshotEvents(null, a); assert.deepEqual(ev.map(e => e.type), ['taskAdded']);
  let s = ev.reduce((st, e) => reduce(st, e, NOW), initialDriverState(NOW));
  const state = (t: number) => resolve(s, t, TASK_DRIVER_CONFIG).state;
  assert.equal(state(NOW + 5000), 'idle'); assert.equal(state(at(FRI, '10:29')), 'idle', 'more than 30 minutes away: calm');
  assert.equal(state(at(FRI, '10:31')), 'strict', 'within 30 minutes: strict');
  for (const t of ['10:50', '10:59', '11:00', '11:01', '12:00']) assert.notEqual(state(at(FRI, t)), 'angry', t);
  assert.equal(state(at(FRI, '11:01')), 'idle', 'once it has started, back to calm');
  s = snapshotEvents(a, snap(null)).reduce((st, e) => reduce(st, e, NOW), s); assert.equal(resolve(s, at(FRI, '10:45'), TASK_DRIVER_CONFIG).state, 'idle', 'removed: no more strictness');
  assert.deepEqual(snapshotEvents(a, snap({ title: 'Standup', at: at(FRI, '12:00') })).map(e => e.type), ['taskDueChanged']);
  assert.deepEqual(snapshotEvents(a, a), []);
});
