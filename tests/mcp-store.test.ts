import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, MemoryStore, apply, emptyDoc, parseDoc, read, update, view, type Call, type Doc } from '../src/server/dashyStore';

const MIN = 60_000, T0 = Date.parse('2026-10-16T12:00:00+02:00');
const iso = (ms: number) => new Date(ms).toISOString();
const ok = (d: Doc, c: Call, now = T0) => { const o = apply(d, c, now); assert.ok(o.ok, JSON.stringify(o)); return o.doc; };

test('a new document is calm', () => {
  const v = view(emptyDoc(T0), T0);
  assert.deepEqual([v.state, v.line, v.source, v.rule], ['idle', '', 'driver', 'idle']);
});

test('task events go through the driver: added -> received, due within the hour -> strict, within 15 minutes -> angry', () => {
  let d = ok(emptyDoc(T0), { tool: 'task', action: 'added', id: 'offerte', due: iso(T0 + 50 * MIN) });
  assert.equal(view(d, T0 + 100).state, 'received');
  assert.equal(view(d, T0 + 2000).state, 'strict');
  assert.equal(view(d, T0 + 36 * MIN + 2000).state, 'angry');
  d = ok(d, { tool: 'task', action: 'done', id: 'offerte' }, T0 + 5000);
  assert.equal(view(d, T0 + 5000).state, 'done');
  assert.equal(view(d, T0 + 5000 + 4000).state, 'idle');
});

test('done and removed are lenient about unknown ids; due and invalid input are not', () => {
  const d = emptyDoc(T0);
  assert.equal(view(ok(d, { tool: 'task', action: 'done', id: 'from-before' }), T0).state, 'done');
  ok(d, { tool: 'task', action: 'removed', id: 'never-seen' });
  for (const [c, why] of [
    [{ tool: 'task', action: 'due', id: 'unknown', due: iso(T0) }, 'due on unknown id'],
    [{ tool: 'task', action: 'added', id: 'a b', due: null }, 'space in id'],
    [{ tool: 'task', action: 'added', id: '', due: null }, 'empty id'],
    [{ tool: 'task', action: 'added', id: 'x'.repeat(65), due: null }, 'long id'],
    [{ tool: 'task', action: 'added', id: 'x', due: 'morgen 15:00' }, 'natural language due'],
    [{ tool: 'task', action: 'added', id: 'x', due: iso(T0 + 400 * 24 * 60 * MIN) }, 'due more than a year away'],
  ] as [Call, string][]) assert.equal(apply(d, c, T0).ok, false, why);
});

test('at most 200 open tasks; an existing id can still be updated at the limit', () => {
  let d = emptyDoc(T0);
  for (let i = 0; i < LIMITS.openTasks; i++) d = ok(d, { tool: 'task', action: 'added', id: 't' + i, due: null });
  assert.equal(apply(d, { tool: 'task', action: 'added', id: 'one-too-many', due: null }, T0).ok, false);
  assert.equal(apply(d, { tool: 'task', action: 'added', id: 't5', due: iso(T0 + MIN) }, T0).ok, true);
});

test('changing and clearing a deadline', () => {
  let d = ok(emptyDoc(T0), { tool: 'task', action: 'added', id: 'a', due: iso(T0 + 10 * MIN) });
  assert.equal(view(d, T0 + 2000).state, 'angry');
  d = ok(d, { tool: 'task', action: 'due', id: 'a', due: iso(T0 + 5 * 60 * MIN) }, T0 + 2000);
  assert.equal(view(d, T0 + 3000).state, 'idle');
  d = ok(d, { tool: 'task', action: 'due', id: 'a', due: null }, T0 + 3000);
  assert.equal(view(d, T0 + 4000).rule, 'idle');
});

test('flags map to waiting, blocked, break (sleepy), working', () => {
  const d = emptyDoc(T0);
  for (const [flag, state] of [['waiting', 'waiting'], ['blocked', 'blocked'], ['break', 'sleepy'], ['working', 'working']] as const) {
    const on = ok(d, { tool: 'flag', flag, value: true });
    assert.equal(view(on, T0).state, state, flag);
    assert.equal(view(ok(on, { tool: 'flag', flag, value: false }), T0).state, 'idle', flag + ' off');
  }
  assert.equal(apply(d, { tool: 'flag', flag: 'banana' as never, value: true }, T0).ok, false);
  assert.equal(apply(d, { tool: 'flag', flag: 'waiting', value: 'yes' as never }, T0).ok, false);
});

test('activity keeps Dashy from turning sad', () => {
  let d = emptyDoc(T0);
  assert.equal(view(d, T0 + 60 * MIN).state, 'sad');
  d = ok(d, { tool: 'activity' }, T0 + 59 * MIN);
  assert.equal(view(d, T0 + 60 * MIN).state, 'idle');
});

test('mood: shows when calm, expires, can be cleared, and is clamped and validated', () => {
  let d = ok(emptyDoc(T0), { tool: 'mood', state: 'happy', line: 'Lekker bezig!', minutes: 10 });
  assert.deepEqual([view(d, T0).state, view(d, T0).line, view(d, T0).source], ['happy', 'Lekker bezig!', 'claude']);
  assert.equal(view(d, T0 + 10 * MIN).source, 'driver', 'expired');
  assert.equal(view(d, T0 + 10 * MIN).line, '');
  d = ok(d, { tool: 'mood', clear: true });
  assert.equal(view(d, T0).source, 'driver');
  for (const [c, why] of [
    [{ tool: 'mood', state: 'blocked', line: 'x' }, 'blocked not allowed'], [{ tool: 'mood', state: 'done', line: 'x' }, 'done not allowed'], [{ tool: 'mood', state: 'banana', line: 'x' }, 'unknown'],
    [{ tool: 'mood', line: 'x' }, 'no state'], [{ tool: 'mood', state: 'happy' }, 'no line'], [{ tool: 'mood', state: 'happy', line: '  ' }, 'blank line'],
    [{ tool: 'mood', state: 'happy', line: 'x'.repeat(101) }, 'long line'], [{ tool: 'mood', state: 'happy', line: 'x', minutes: 0 }, '0 minutes'],
    [{ tool: 'mood', state: 'happy', line: 'x', minutes: 241 }, '241 minutes'], [{ tool: 'mood', state: 'happy', line: 'x', minutes: NaN }, 'NaN minutes'],
  ] as [Call, string][]) assert.equal(apply(emptyDoc(T0), c, T0).ok, false, why);
  assert.equal(view(ok(emptyDoc(T0), { tool: 'mood', state: 'happy', line: 'a\nb <i>c</i>' }), T0).line, 'a b i c /i', 'line is flattened');
});

test('facts beat feelings: a deadline, blocked, waiting, a break or a celebration hides the mood; it returns when they clear', () => {
  const mood = { tool: 'mood', state: 'dancing', line: 'Feest!', minutes: 120 } as const;
  const cases: [Call, string][] = [
    [{ tool: 'flag', flag: 'blocked', value: true }, 'blocked'], [{ tool: 'flag', flag: 'waiting', value: true }, 'waiting'], [{ tool: 'flag', flag: 'break', value: true }, 'sleepy'],
    [{ tool: 'task', action: 'added', id: 'x', due: iso(T0 + 30 * MIN) }, 'strict'], [{ tool: 'task', action: 'added', id: 'x', due: iso(T0 + 5 * MIN) }, 'angry'],
  ];
  for (const [fact, expected] of cases) {
    const d = ok(ok(emptyDoc(T0), mood), fact);
    const v = view(d, T0 + 3000);
    assert.equal(v.state, expected, JSON.stringify(fact)); assert.equal(v.source, 'driver'); assert.equal(v.line, '');
  }
  const blocked = ok(ok(emptyDoc(T0), mood), { tool: 'flag', flag: 'blocked', value: true });
  assert.equal(view(ok(blocked, { tool: 'flag', flag: 'blocked', value: false }), T0 + 5000).state, 'dancing');
  const o = apply(ok(emptyDoc(T0), { tool: 'flag', flag: 'blocked', value: true }), mood, T0);
  assert.ok(o.ok && o.note?.includes('not shown now'), 'Claude is told the mood is hidden, and why');
});

test('nextWakeAt covers deadlines and the end of the mood', () => {
  const d = ok(ok(emptyDoc(T0), { tool: 'task', action: 'added', id: 'a', due: iso(T0 + 90 * MIN) }), { tool: 'mood', state: 'happy', line: 'Hoi', minutes: 5 }, T0 + 2000);
  assert.equal(view(d, T0 + 3000).nextWakeAt, T0 + 2000 + 5 * MIN);
  assert.equal(view(d, T0 + 6 * MIN).nextWakeAt, T0 + 30 * MIN);
});

test('apply never mutates its input', () => {
  const d = Object.freeze(emptyDoc(T0));
  apply(d, { tool: 'task', action: 'added', id: 'a', due: null }, T0);
  apply(d, { tool: 'mood', state: 'happy', line: 'x' }, T0);
  assert.deepEqual(d, emptyDoc(T0));
});

test('storage: update saves on success, not on error; corrupt or missing data gives a fresh document', async () => {
  const s = new MemoryStore();
  assert.equal((await update(s, T0, { tool: 'task', action: 'added', id: 'a', due: null })).outcome.ok, true);
  assert.equal((await read(s, T0)).rev, 1);
  assert.equal((await update(s, T0, { tool: 'task', action: 'added', id: 'bad id', due: null })).outcome.ok, false);
  assert.equal((await read(s, T0)).rev, 1, 'a failed call does not change anything');
  for (const junk of [null, 'garbage', 42, {}, { rev: 1 }, { rev: 1, driver: { tasks: { a: 'x' }, lastActivityAt: 1 } }, { rev: 1, driver: { tasks: {}, lastActivityAt: 1 }, mood: { state: 'blocked', line: 'x', until: 1 } }]) {
    assert.equal(parseDoc(junk), null, JSON.stringify(junk));
    s.doc = junk as never;
    assert.equal((await read(s, T0)).rev, 0);
  }
  assert.ok(parseDoc(JSON.stringify(emptyDoc(T0))), 'JSON text from storage is accepted');
});
