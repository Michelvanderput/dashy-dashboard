import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDashboard, parseMinutes, parseWhen, snapshotEvents, TASK_DRIVER_CONFIG, nowTask } from '../src/tasks';
import { initialDriverState, reduce, resolve } from '../src/driver';
import { adoptTasksHash, loadTasksConnection } from '../src/tasks-connection';

const TODAY = '2026-10-16'; // a Friday
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

test('parseWhen understands the dashboard texts', () => {
  assert.equal(parseWhen('vandaag 19:00', TODAY), at(2026, 10, 16, 19));
  assert.equal(parseWhen('morgen 14:00', TODAY), at(2026, 10, 17, 14));
  assert.equal(parseWhen('zo 10:00', TODAY), at(2026, 10, 18, 10));
  assert.equal(parseWhen('vr 09:00', TODAY), at(2026, 10, 23, 9), 'same weekday = next week');
  assert.equal(parseWhen('15 okt 19:00', TODAY), at(2026, 10, 15, 19));
  assert.equal(parseWhen('22 okt 19:00', TODAY), at(2026, 10, 22, 19));
  assert.equal(parseWhen('3 jan 08:30', '2026-12-20'), at(2027, 1, 3, 8, 30), 'rolls into next year');
});
test('a day without a time is not a deadline; nonsense gives null, never a crash', () => {
  for (const t of ['vandaag', 'morgen', 'ma', '31 okt', '', 'ooit 25:99', 'someday 10:00', '99 xxx 10:00']) assert.equal(parseWhen(t, TODAY), null, t);
});
test('parseMinutes', () => { assert.equal(parseMinutes('0m'), 0); assert.equal(parseMinutes('45m'), 45); assert.equal(parseMinutes('1u 20m'), 80); assert.equal(parseMinutes(undefined), 0); });

const dash = (tasks: unknown[], extra: object = {}) => ({ today: '2026-10-16 vrijdag', tasks, left_open: [], time_today: '0m', ...extra });
test('parseDashboard reads the real dashboard shape and refuses bad data', () => {
  const s = parseDashboard(dash([['2f8ed190', 'Spullen uitzoeken', 'thuis', 'vandaag 19:00', 'Begin bij kasten'], ['175f8e00', 'Grofvuil afvoer regelen', 'thuis', 'vandaag', 'x']], { left_open: ['f381c965'] }));
  assert.equal(s.today, TODAY); assert.equal(s.tasks[0].due, at(2026, 10, 16, 19)); assert.equal(s.tasks[1].due, null);
  assert.deepEqual(s.leftOpen, ['f381c965']); assert.equal(nowTask(s)!.id, '2f8ed190'); assert.equal(nowTask(null), null);
  for (const bad of [null, 5, { today: 'x', tasks: [] }, dash('nope' as never), dash([['bad id!', 't', 'c', 'w', 'n']]), dash([['a', 5, 'c', 'w', 'n']]), '{nope']) assert.throws(() => parseDashboard(bad as never));
});

test('snapshotEvents: new task = added, gone = done, changed time = moved, left over = waiting', () => {
  const a = parseDashboard(dash([['a', 'A', 'thuis', 'vandaag 19:00', ''], ['b', 'B', 'thuis', 'morgen 10:00', '']]));
  const first = snapshotEvents(null, a);
  assert.deepEqual(first.map(e => e.type), ['taskAdded', 'taskAdded']);
  const b = parseDashboard(dash([['b', 'B', 'thuis', 'morgen 11:00', ''], ['c', 'C', 'prive', '', '']], { left_open: ['x'], time_today: '10m' }));
  const ev = snapshotEvents(a, b);
  assert.deepEqual(ev.map(e => e.type).sort(), ['activity', 'taskAdded', 'taskDone', 'taskDueChanged', 'waiting']);
  assert.deepEqual(snapshotEvents(b, b), []);
});

// the whole chain with the driver: he is calm, celebrates, gets strict near a deadline, and is never angry
const run = (events: ReturnType<typeof snapshotEvents>, s = initialDriverState(0), now = 0) => events.reduce((st, e) => reduce(st, e, now), s);
test('scenario: new task -> received, done -> done, deadline in 20 min -> strict, after it -> back to calm', () => {
  const t0 = at(2026, 10, 16, 18, 0);
  let s = initialDriverState(t0);
  const a = parseDashboard(dash([['a', 'A', 'thuis', 'vandaag 19:00', '']]));
  s = run(snapshotEvents(null, a), s, t0);
  assert.equal(resolve(s, t0 + 100, TASK_DRIVER_CONFIG).state, 'received');
  assert.equal(resolve(s, t0 + 5000, TASK_DRIVER_CONFIG).state, 'idle');
  assert.equal(resolve(s, at(2026, 10, 16, 18, 40), TASK_DRIVER_CONFIG).state, 'strict');
  assert.equal(resolve(s, at(2026, 10, 16, 19, 0), TASK_DRIVER_CONFIG).state !== 'angry', true);
  for (const m of [0, 1, 14, 16, 59]) assert.notEqual(resolve(s, at(2026, 10, 16, 19, m), TASK_DRIVER_CONFIG).state, 'angry', 'never angry');
  const done = run(snapshotEvents(a, parseDashboard(dash([]))), s, t0 + 60_000);
  assert.equal(resolve(done, t0 + 61_000, TASK_DRIVER_CONFIG).state, 'done');
});
test('scenario: things left over from before make him wait, calmly', () => {
  const t0 = at(2026, 10, 16, 9, 0);
  const s = run(snapshotEvents(null, parseDashboard(dash([['a', 'A', 'thuis', '15 okt 19:00', '']], { left_open: ['a'] }))), initialDriverState(t0), t0);
  assert.equal(resolve(s, t0 + 5000, TASK_DRIVER_CONFIG).state, 'waiting');
});

// connection
const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) }; };
test('connection: adopted from the hash once, cleaned from the address, unsafe urls refused', () => {
  const st = mem();
  const r = adoptTasksHash('#tasks=https%3A%2F%2Fexample.com%2Fdash&key=abcdefghij12&x=1', st);
  assert.deepEqual(r, { cleaned: '#x=1', adopted: true });
  assert.deepEqual(loadTasksConnection(st), { url: 'https://example.com/dash', token: 'abcdefghij12', actionUrl: null, actionToken: null });
  const st2 = mem();
  for (const bad of ['javascript:alert(1)', 'http://evil.example/x', 'ftp://x.y/z', 'nonsense']) assert.equal(adoptTasksHash('#tasks=' + encodeURIComponent(bad), st2).adopted, false, bad);
  assert.equal(loadTasksConnection(st2), null);
  assert.equal(adoptTasksHash('#tasks=http%3A%2F%2F127.0.0.1%3A8787%2Fd', mem()).adopted, true, 'localhost over http is fine');
  const st3 = mem(); st3.set('dashy.tasks', '{broken'); assert.equal(loadTasksConnection(st3), null);
});

import { adoptPastedLink } from '../src/tasks-connection';
test('pasted link (the Mac window has no address bar): full link or just the hash, anything else is refused and stores nothing', () => {
  const link = 'https://x.test/#tasks=' + encodeURIComponent('https://x.test/api/state') + '&key=abcdefghij12&act=zyxwvutsrq99';
  const a = mem(); assert.equal(adoptPastedLink('  ' + link + '\n', a), true);
  assert.deepEqual(loadTasksConnection(a), { url: 'https://x.test/api/state', token: 'abcdefghij12', actionToken: 'zyxwvutsrq99', actionUrl: 'https://x.test/api/action' });
  const b = mem(); assert.equal(adoptPastedLink(link.slice(link.indexOf('#')), b), true); assert.ok(loadTasksConnection(b));
  for (const bad of ['', 'hallo', 'https://x.test/', 'https://x.test/#tasks=javascript%3Aalert(1)', '#tasks=http%3A%2F%2Fevil.example%2Fs', '#key=abcdefghij12']) { const c = mem(); assert.equal(adoptPastedLink(bad, c), false, bad); assert.equal(loadTasksConnection(c), null); }
});
