import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extendFocus, focusView, parseFocus, startFocus } from '../src/focus';
import { EMPTY_PLAN, parseCalmPlan, parseWave, planFromText, waveView, WAVE_MS } from '../src/calm';
import { DEFAULT_BASICS, parseBasics, parseBasicsState, toggleBasic } from '../src/basics';
import { isWindDown, parseWindDown } from '../src/winddown';
import { joinNote, splitNote } from '../src/steps';
import { zonedToEpoch } from '../src/server/time';
import { addTasks, dashboard, updateTasks } from '../src/server/ops';
import { MemoryStore } from '../src/server/store';
import { InputError } from '../src/server/model';
import { parseDashboard } from '../src/tasks';

const NOW = 1_800_000_000_000, MIN = 60_000;
const at = (h: number, m = 0) => zonedToEpoch(2026, 10, 16, h, m)!;

test('focus: 10 minutes count down, it ends without blame, and after 90 minutes it suggests a drink', () => {
  const f = startFocus(NOW, 10, 'abc12345');
  let v = focusView(f, NOW); assert.deepEqual([v.over, v.mmss, v.fraction, v.suggestBreak], [false, '10:00', 1, false]);
  v = focusView(f, NOW + 4 * MIN + 30_000); assert.equal(v.mmss, '5:30'); assert.ok(Math.abs(v.fraction - .55) < 1e-9);
  v = focusView(f, NOW + 10 * MIN); assert.deepEqual([v.over, v.leftMs, v.fraction], [true, 0, 0]);
  const longer = extendFocus(extendFocus(f, 10), 10); assert.equal(longer.minutes, 30);
  assert.equal(focusView(startFocus(NOW, 100), NOW + 89 * MIN).suggestBreak, false); assert.equal(focusView(startFocus(NOW, 100), NOW + 90 * MIN).suggestBreak, true);
  assert.equal(startFocus(NOW, 0).minutes, 1); assert.equal(startFocus(NOW, 9999).minutes, 240);
});
test('focus: only a valid, recent session is read back', () => {
  const f = JSON.stringify(startFocus(NOW, 10, 'abc'));
  assert.equal(parseFocus(f, NOW + 5 * MIN)?.taskId, 'abc');
  for (const bad of [null, '', 'nope', '{}', '{"startedAt":"x","minutes":10}', JSON.stringify({ startedAt: NOW, minutes: 0 }), JSON.stringify({ startedAt: NOW + 10 * MIN, minutes: 10 })]) assert.equal(parseFocus(bad, NOW), null);
  assert.equal(parseFocus(f, NOW + 13 * 3600_000), null); // forgotten after half a day
});

test('calm plan: lines are tidied and capped, bad storage gives an empty plan', () => {
  const p = planFromText('  loop buiten \n\n water  drinken\n1\n2\n3\n4\n5', ' gitaar  spelen ');
  assert.deepEqual(p.lines.slice(0, 2), ['loop buiten', 'water drinken']); assert.equal(p.lines.length, 6); assert.equal(p.evening, 'gitaar spelen');
  assert.deepEqual(parseCalmPlan(JSON.stringify(p)), p);
  for (const bad of [null, 'x', '[]', '{"lines":5}']) assert.deepEqual(parseCalmPlan(bad), bad === '[]' ? EMPTY_PLAN : EMPTY_PLAN);
  assert.equal(planFromText('x'.repeat(500), '').lines[0].length, 120);
});
test('wave timer: a quarter of an hour with gentle words that never blame, then an open door', () => {
  const s = NOW;
  const w0 = waveView(s, s); assert.deepEqual([w0.over, w0.mmss], [false, '15:00']); assert.match(w0.message, /gaat voorbij/);
  assert.match(waveView(s, s + 7 * MIN).message, /hoeft niets op te lossen/); assert.match(waveView(s, s + 12 * MIN).message, /zachter/);
  const end = waveView(s, s + WAVE_MS); assert.equal(end.over, true); assert.match(end.message, /Nog een kwartier mag altijd/);
  assert.doesNotMatch([w0, end].map(x => x.message).join(' '), /fout|zwak|faal|mislukt|terugval/i);
  assert.equal(parseWave(String(s), s + MIN), s); assert.equal(parseWave('x', s), null); assert.equal(parseWave(String(s), s + 3 * 3600_000), null); assert.equal(parseWave(null, s), null);
});

test('basics: the list is yours or the default, today only, and a new day starts empty', () => {
  assert.deepEqual(parseBasics(undefined), [...DEFAULT_BASICS]); assert.deepEqual(parseBasics('eten, Drinken, eten, 5, <b>'), ['eten', 'drinken']); assert.deepEqual(parseBasics('1,2'), [...DEFAULT_BASICS]);
  let st = parseBasicsState(null, '2026-10-16'); st = toggleBasic(toggleBasic(st, 'eten'), 'buiten'); assert.deepEqual(st.done, ['eten', 'buiten']); assert.deepEqual(toggleBasic(st, 'eten').done, ['buiten']);
  assert.deepEqual(parseBasicsState(JSON.stringify(st), '2026-10-16').done, ['eten', 'buiten']);
  assert.deepEqual(parseBasicsState(JSON.stringify(st), '2026-10-17'), { day: '2026-10-17', done: [] }); // yesterday leaves nothing behind
  assert.deepEqual(parseBasicsState('garbage', '2026-10-16').done, []);
});

test('wind down: from the set time until five, off on request', () => {
  assert.equal(parseWindDown(undefined), 22 * 60 + 30); assert.equal(parseWindDown('21:15'), 21 * 60 + 15); assert.equal(parseWindDown('25:99'), 22 * 60 + 30); assert.equal(parseWindDown('UIT'), null);
  assert.equal(isWindDown(at(22, 29), 1350), false); assert.equal(isWindDown(at(22, 30), 1350), true); assert.equal(isWindDown(at(4, 59), 1350), true); assert.equal(isWindDown(at(5), 1350), false); assert.equal(isWindDown(at(12), 1350), false); assert.equal(isWindDown(at(23), null), false);
});

test('first step: kept in the note behind a marker, split and joined without losing either', () => {
  assert.deepEqual(splitNote('Vraag naar de sleutel ▸ Open de mail'), { note: 'Vraag naar de sleutel', step: 'Open de mail' });
  assert.deepEqual(splitNote('▸ Open de mail'), { note: '', step: 'Open de mail' }); assert.deepEqual(splitNote('alleen een note'), { note: 'alleen een note', step: '' }); assert.deepEqual(splitNote(null), { note: '', step: '' });
  assert.equal(joinNote('a', 'b'), 'a ▸ b'); assert.equal(joinNote(null, 'b'), '▸ b'); assert.equal(joinNote('a', null), 'a'); assert.equal(joinNote('', ' '), null); assert.equal(joinNote('a ▸ evil', 'b'), 'a - evil ▸ b');
});
test('first step through the tools: add with a step, change only the step, clear it, and the screen reads it back', async () => {
  const store = new MemoryStore();
  const { added } = await addTasks(store, { tasks: [{ title: 'Bel de bank', category: 'thuis', note: 'Over de lening', step: 'Zoek het nummer op' }, { title: 'Wassen ophangen', category: 'thuis' }] }, NOW);
  let snap = parseDashboard(await dashboard(store, NOW));
  assert.deepEqual([snap.tasks[0].note, snap.tasks[0].step, snap.tasks[1].step], ['Over de lening', 'Zoek het nummer op', '']);
  await updateTasks(store, { updates: [{ id: added[0].id, step: 'Pak je telefoon' }] }, NOW);
  snap = parseDashboard(await dashboard(store, NOW)); assert.deepEqual([snap.tasks[0].note, snap.tasks[0].step], ['Over de lening', 'Pak je telefoon']);
  await updateTasks(store, { updates: [{ id: added[0].id, step: null }, { id: added[1].id, step: 'Pak de wasknijpers' }] }, NOW);
  snap = parseDashboard(await dashboard(store, NOW)); assert.deepEqual([snap.tasks[0].note, snap.tasks[0].step, snap.tasks[1].step], ['Over de lening', '', 'Pak de wasknijpers']);
  await assert.rejects(addTasks(store, { tasks: [{ title: 'x', category: 'thuis', step: 'y'.repeat(81) }] }, NOW), InputError);
  await assert.rejects(addTasks(store, { tasks: [{ title: 'x', category: 'thuis', step: ' ' }] }, NOW), InputError);
});
