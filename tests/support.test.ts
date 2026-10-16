import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extendSession, isOver, remainingMs, startSession, timerLabel, timerSpoken } from '../src/dashboard/session';
import { BREATH, URGE_DELAY_MS, addEntry, breath, closing, distractionFor, parseLog, urgeLeft, MAX_LOG } from '../src/dashboard/urge';
import { dayKey, doneToday, habitToNudge, setToday, weekCount, weekDays, weekGoalMet, type Habit } from '../src/dashboard/habits';
import { apply, emptyDoc, parseDoc, type Call, type Doc } from '../src/server/dashyStore';
import { handleActionRequest } from '../src/server/actionHttp';
import { MemoryStore } from '../src/server/dashyStore';
import { parseRemoteState } from '../src/state-client';
import { buildStateBody } from '../src/server/stateHttp';

const MIN = 60_000, T0 = Date.parse('2026-10-16T12:00:00+02:00'); // a Friday
const ok = (d: Doc, c: Call, now = T0) => { const o = apply(d, c, now); assert.ok(o.ok, JSON.stringify(o)); return o.doc; };

test('focus session: 10 minutes, shows time left, never an overrun, can be extended from now', () => {
  const s = startSession({ id: 'a', title: 'Offerte' }, T0);
  assert.equal(remainingMs(s, T0 + 5 * MIN), 5 * MIN); assert.equal(isOver(s, T0 + 9 * MIN), false); assert.equal(isOver(s, T0 + 10 * MIN), true);
  assert.equal(timerLabel(10 * MIN), '10:00'); assert.equal(timerLabel(9 * MIN + 41_000), '9:41'); assert.equal(timerLabel(-5000), '0:00');
  assert.equal(timerSpoken(30_000), 'nog een minuut'); assert.equal(timerSpoken(5 * MIN), 'nog 5 minuten');
  const more = extendSession(s, T0 + 11 * MIN); assert.equal(remainingMs(more, T0 + 11 * MIN), 10 * MIN); assert.equal(more.taskId, 'a');
});

test('urge: ten minute delay, 4 s in / 6 s out, smooth, periodic; the log is capped and garbage proof', () => {
  assert.equal(urgeLeft(T0, T0), URGE_DELAY_MS); assert.equal(urgeLeft(T0, T0 + URGE_DELAY_MS + 5), 0);
  const cycle = BREATH.inMs + BREATH.outMs;
  assert.deepEqual([breath(0).phase, breath(BREATH.inMs - 1).phase, breath(BREATH.inMs).phase, breath(cycle - 1).phase], ['in', 'in', 'out', 'out']);
  assert.ok(breath(0).fill < .001 && breath(BREATH.inMs - 1).fill > .999 && breath(cycle - 1).fill < .01);
  let prev = breath(0).fill; for (let t = 0; t < cycle * 2; t += 50) { const f = breath(t).fill; assert.ok(f >= 0 && f <= 1 && Math.abs(f - prev) < .08, 'smooth'); prev = f; }
  assert.deepEqual(breath(cycle + 123), { ...breath(123) }); assert.ok(Number.isFinite(breath(-500).fill));
  assert.notEqual(distractionFor(0), distractionFor(1)); assert.equal(distractionFor(-1).length > 5, true);
  let log = parseLog(null); for (let i = 0; i < MAX_LOG + 20; i++) log = addEntry(log, { at: i, outcome: 'overleefd' });
  assert.equal(log.length, MAX_LOG);
  assert.deepEqual(parseLog('{nope'), []); assert.deepEqual(parseLog('[{"at":1,"outcome":"x"},{"at":2,"outcome":"gebeurd"}]'), [{ at: 2, outcome: 'gebeurd' }]);
  for (const o of ['overleefd', 'gebeurd', 'gestopt'] as const) assert.ok(!/\d|streak|mislukt|fout|schaam/i.test(closing(o)), 'no numbers, no judgement');
});

test('habits: Dutch week Monday-Sunday, x of y, no streaks, a miss costs nothing', () => {
  assert.equal(dayKey(T0), '2026-10-16');
  assert.deepEqual(weekDays(T0), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.equal(dayKey(Date.parse('2026-10-16T23:30:00+02:00')), '2026-10-16'); assert.equal(dayKey(Date.parse('2026-10-17T00:10:00+02:00')), '2026-10-17');
  let h: Habit = { id: 'w', title: 'Wandelen', perWeek: 2, done: [] };
  assert.equal(doneToday(h, T0), false);
  h = setToday(h, true, T0); h = setToday(h, true, T0); assert.deepEqual(h.done, ['2026-10-16'], 'idempotent');
  h = setToday(h, true, T0 - 2 * 24 * 3600_000); assert.equal(weekCount(h, T0), 2); assert.equal(weekGoalMet(h, T0), true);
  assert.equal(weekCount(h, T0 + 7 * 24 * 3600_000), 0, 'a new week starts at zero: no debt');
  assert.equal(setToday(h, false, T0).done.length, 1);
  assert.equal(setToday({ ...h, done: ['2020-01-01', '2026-10-15'] }, true, T0).done.includes('2020-01-01'), false, 'old days are dropped');
  const a: Habit = { id: 'a', title: 'A', perWeek: 3, done: [] }, b: Habit = { id: 'b', title: 'B', perWeek: 1, done: [] }, c: Habit = { id: 'c', title: 'C', perWeek: 2, done: ['2026-10-16'] };
  assert.equal(habitToNudge([a, b, c], T0)?.id, 'b', 'closest to its goal, never one already done today');
  assert.equal(habitToNudge([c], T0), null);
});

test('habit tool: add with if-then plan, change, check/uncheck, remove, limits; checking is a sign of life', () => {
  let d = ok(emptyDoc(T0), { tool: 'habit', action: 'added', id: 'wandelen', title: 'Wandelen', perWeek: 3, plan: 'Als ik koffie zet, dan loop ik 5 minuten' });
  assert.equal(d.habits.wandelen.plan, 'Als ik koffie zet, dan loop ik 5 minuten');
  d = ok(d, { tool: 'habit', action: 'check', id: 'wandelen' }, T0 + 1000); assert.deepEqual(d.habits.wandelen.done, ['2026-10-16']); assert.equal(d.driver.lastActivityAt, T0 + 1000);
  d = ok(d, { tool: 'habit', action: 'added', id: 'wandelen', perWeek: 4 }); assert.equal(d.habits.wandelen.perWeek, 4); assert.equal(d.habits.wandelen.title, 'Wandelen'); assert.equal(d.habits.wandelen.done.length, 1, 'changing keeps the history');
  d = ok(d, { tool: 'habit', action: 'uncheck', id: 'wandelen' }); assert.deepEqual(d.habits.wandelen.done, []);
  for (const c of [{ tool: 'habit', action: 'check', id: 'nope' }, { tool: 'habit', action: 'added', id: 'x' }, { tool: 'habit', action: 'added', id: 'x', title: 'X', perWeek: 9 }, { tool: 'habit', action: 'added', id: 'a b', title: 'X' }] as Call[]) assert.equal(apply(d, c, T0).ok, false, JSON.stringify(c));
  let many = emptyDoc(T0); for (let i = 0; i < 12; i++) many = ok(many, { tool: 'habit', action: 'added', id: 'h' + i, title: 'H' + i });
  assert.equal(apply(many, { tool: 'habit', action: 'added', id: 'one-more', title: 'X' }, T0).ok, false);
  d = ok(d, { tool: 'habit', action: 'removed', id: 'wandelen' }); assert.deepEqual(d.habits, {});
  assert.deepEqual(parseDoc({ rev: 1, driver: emptyDoc(T0).driver, mood: null })!.habits, {}, 'old documents still load');
  assert.equal(parseDoc({ ...emptyDoc(T0), habits: { a: { id: 'a', title: 'A', perWeek: 99, done: [] } } }), null);
});

const TOKEN = 'action-secret-1';
const act = async (store: MemoryStore, body: unknown) => handleActionRequest(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) }), { store, now: () => T0 + 5000, actionToken: TOKEN, allow: async () => true, log: () => {} });
test('action endpoint: add (title only), focus, check/uncheck habit; nothing else is possible', async () => {
  const store = new MemoryStore(); store.doc = ok(ok(emptyDoc(T0), { tool: 'habit', action: 'added', id: 'w', title: 'Wandelen' }), { tool: 'task', action: 'added', id: 'a', title: 'Offerte', due: null });
  let r = await act(store, { action: 'add', title: '  Tandarts bellen ' }); assert.equal(r.status, 200);
  let b = parseRemoteState(await r.text()); assert.ok(b.items.some(i => i.title === 'Tandarts bellen' && i.at === null && i.kind === 'task'));
  assert.equal((await act(store, { action: 'add', title: '   ' })).status, 400);
  assert.equal((await act(store, { action: 'add' })).status, 400);
  r = await act(store, { action: 'focus', id: 'a' }); b = parseRemoteState(await r.text()); assert.equal(b.focusId, 'a');
  r = await act(store, { action: 'focus', id: null }); assert.equal(parseRemoteState(await r.text()).focusId, null);
  r = await act(store, { action: 'check', id: 'w' }); b = parseRemoteState(await r.text()); assert.deepEqual(b.habits[0].done, ['2026-10-16']);
  r = await act(store, { action: 'uncheck', id: 'w' }); assert.deepEqual(parseRemoteState(await r.text()).habits[0].done, []);
  for (const body of [{ action: 'mood', id: 'a' }, { action: 'removed', id: 'a' }, { action: 'check' }, 'x', null]) assert.equal((await act(store, body)).status, 400, JSON.stringify(body));
  assert.equal((await act(store, { action: 'check', id: 'zzz' })).status, 409);
});

test('state body carries habits and the client validates them strictly', () => {
  const d = ok(emptyDoc(T0), { tool: 'habit', action: 'added', id: 'w', title: 'Wandelen', perWeek: 2 });
  const body = buildStateBody(d, T0);
  assert.equal(parseRemoteState(JSON.stringify(body)).habits[0].title, 'Wandelen');
  assert.deepEqual(parseRemoteState({ state: 'idle', line: '', source: 'driver', nextWakeAt: null }).habits, []);
  for (const habits of [[{ id: 'a', title: '', perWeek: 2, done: [] }], [{ id: 'a', title: 'A', perWeek: 0, done: [] }], [{ id: 'a', title: 'A', perWeek: 2, done: ['gisteren'] }], 'x']) assert.throws(() => parseRemoteState({ ...body, habits }));
});
