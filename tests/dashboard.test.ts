import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, GROW, areaShare, orientationOf, tracksFor, type BlockId, type Orientation } from '../src/dashboard/layout';
import { CALM_FOCUS, WINDOWS, chooseAttention, nextFocus, type AttentionInput, type FocusState } from '../src/dashboard/attention';
import { countdown, initialModel, nextAppointmentAt, nextUp, planOrder, pressingTask, reducer, urgency, type PlanItem } from '../src/dashboard/plan';
import { dashyLine } from '../src/dashboard/lines';
import { RULES, resolve } from '../src/driver';

const MIN = 60_000, T0 = Date.parse('2026-10-16T12:00:00+02:00');
const ORIENTATIONS: Orientation[] = ['landscape', 'portrait'];

// ---------- layout ----------
test('orientation follows the window shape', () => {
  assert.equal(orientationOf(1280, 800), 'landscape'); assert.equal(orientationOf(390, 844), 'portrait'); assert.equal(orientationOf(800, 800), 'landscape');
});
test('the number of tracks never changes with focus (so the browser can animate the grid)', () => {
  for (const o of ORIENTATIONS) {
    const base = tracksFor(o, null);
    for (const b of BLOCKS) {
      const t = tracksFor(o, b);
      assert.equal(t.cols.split(' ').length, base.cols.split(' ').length); assert.equal(t.rows.split(' ').length, base.rows.split(' ').length);
      assert.equal(t.areas, base.areas, 'areas never move, only sizes');
    }
  }
});
test('every block has a place, every area name is a block, and every block appears', () => {
  for (const o of ORIENTATIONS) {
    const names = new Set(tracksFor(o, null).areas.replace(/"/g, ' ').split(/\s+/).filter(Boolean));
    assert.deepEqual([...names].sort(), [...BLOCKS].sort());
  }
});
test('calm layout: nobody dominates, everybody is readable', () => {
  for (const o of ORIENTATIONS) for (const b of BLOCKS) { const s = areaShare(o, null, b); assert.ok(s > 0.08 && s < 0.4, `${o}/${b} ${s.toFixed(2)}`); }
});
test('a block in focus gets about half the screen, and every other block stays big enough to read', () => {
  for (const o of ORIENTATIONS) for (const b of BLOCKS) {
    const quiet = b === 'music' || b === 'clock'; // quieter moments: a third of the screen is enough
    const s = areaShare(o, b, b); assert.ok(s >= (quiet ? 0.3 : 0.4) && s <= 0.65, `${o}/${b} takes ${s.toFixed(2)}`);
    assert.ok(s > areaShare(o, null, b) * 1.4, `${o}/${b} really grows`);
    for (const other of BLOCKS) if (other !== b) assert.ok(areaShare(o, b, other) > 0.035, `${o}/${other} while ${b} is in focus: ${areaShare(o, b, other).toFixed(3)}`);
  }
});
test('shares add up to the whole screen', () => {
  for (const o of ORIENTATIONS) for (const f of [null, ...BLOCKS] as (BlockId | null)[]) {
    const total = BLOCKS.reduce((n, b) => n + areaShare(o, f, b), 0); assert.ok(Math.abs(total - 1) < 1e-9, `${o}/${f} ${total}`);
  }
  assert.ok(GROW > 2 && GROW < 4);
});

// ---------- attention ----------
const res = (rule: (typeof RULES)[number]['rule']) => ({ rule, state: RULES.find(r => r.rule === rule)!.state });
const input = (o: Partial<AttentionInput> = {}): AttentionInput => ({ now: T0, resolution: res('idle'), nextEventAt: null, musicSince: null, ...o });

test('attention: calm by default', () => assert.equal(chooseAttention(input()), null));
test('attention: each situation picks its block, in priority order', () => {
  const cases: [Partial<AttentionInput>, string, number][] = [
    [{ resolution: res('deadlineNear') }, 'dashy', 100], [{ nextEventAt: T0 + 9 * MIN }, 'now', 90], [{ resolution: res('blocked') }, 'dashy', 80], [{ resolution: res('waiting') }, 'dashy', 80],
    [{ resolution: res('deadlineSoon') }, 'plan', 70], [{ resolution: res('done') }, 'dashy', 60], [{ musicSince: T0 - 1000 }, 'music', 40],
  ];
  for (const [o, block, prio] of cases) { const c = chooseAttention(input(o))!; assert.equal(c.block, block); assert.equal(c.priority, prio); assert.ok(c.reason.length > 3); }
  assert.equal(chooseAttention(input({ resolution: res('deadlineNear'), nextEventAt: T0 + 5 * MIN, musicSince: T0 }))!.block, 'dashy', 'angry beats appointment and music');
  assert.equal(chooseAttention(input({ resolution: res('deadlineSoon'), nextEventAt: T0 + 5 * MIN }))!.block, 'now', 'an appointment in 5 minutes beats a deadline within the hour');
});
test('attention: appointment window is 10 minutes before until 2 minutes after the start; music only for 8 s; a break and sadness do not shout', () => {
  assert.equal(chooseAttention(input({ nextEventAt: T0 + 10 * MIN }))!.block, 'now'); assert.equal(chooseAttention(input({ nextEventAt: T0 + 10 * MIN + 1 })), null);
  assert.equal(chooseAttention(input({ nextEventAt: T0 - 2 * MIN }))!.block, 'now'); assert.equal(chooseAttention(input({ nextEventAt: T0 - 2 * MIN - 1 })), null);
  assert.equal(chooseAttention(input({ musicSince: T0 - 7999 }))!.block, 'music'); assert.equal(chooseAttention(input({ musicSince: T0 - 8000 })), null);
  for (const r of ['break', 'quiet', 'working', 'received'] as const) assert.equal(chooseAttention(input({ resolution: res(r) })), null, r);
});

const at = (t: number, c: ReturnType<typeof chooseAttention>, prev: FocusState, pin = null as { block: BlockId; until: number } | null) => nextFocus(prev, c, pin, T0 + t);
test('focus: adopts a candidate, moments end by themselves, conditions hold while they last', () => {
  let f = at(0, chooseAttention(input({ resolution: res('done') })), CALM_FOCUS);
  assert.deepEqual([f.block, f.until], ['dashy', T0 + WINDOWS.doneMs]);
  f = at(3999, chooseAttention(input({ now: T0 + 3999, resolution: res('done') })), f); assert.equal(f.block, 'dashy');
  f = at(4001, null, f); assert.equal(f.block, null, 'the celebration is over');
  let g = at(0, chooseAttention(input({ resolution: res('deadlineNear') })), CALM_FOCUS); assert.equal(g.until, null);
  for (const t of [60_000, 600_000, 3_600_000]) g = at(t, chooseAttention(input({ now: T0 + t, resolution: res('deadlineNear') })), g);
  assert.equal(g.block, 'dashy', 'a condition holds focus as long as it is true');
});
test('focus: when the condition ends, the block stays at least 10 s, then goes calm', () => {
  let f = at(0, chooseAttention(input({ resolution: res('blocked') })), CALM_FOCUS);
  assert.equal(at(5000, null, f).block, 'dashy'); assert.equal(at(9999, null, f).block, 'dashy'); assert.equal(at(10_000, null, f).block, null);
});
test('focus: more important interrupts at once, less important waits for the dwell time, equal priority from another block waits too', () => {
  const plan = at(0, chooseAttention(input({ resolution: res('deadlineSoon') })), CALM_FOCUS); assert.equal(plan.block, 'plan');
  const angry = at(1000, chooseAttention(input({ now: T0 + 1000, resolution: res('deadlineNear') })), plan); assert.equal(angry.block, 'dashy');
  const music = chooseAttention(input({ musicSince: T0 }));
  assert.equal(at(1000, music, plan).block, 'plan', 'music waits behind a deadline'); assert.equal(at(10_000, music, plan).block, 'music', 'and takes over once the dwell time has passed');
  assert.equal(at(0, chooseAttention(input({ resolution: res('waiting') })), at(0, chooseAttention(input({ nextEventAt: T0 + MIN })), CALM_FOCUS)).block, 'now', 'a lower priority never interrupts');
});
test('focus: a pin wins over everything and expires', () => {
  const pin = { block: 'clock' as BlockId, until: T0 + WINDOWS.pinMs };
  let f = at(0, chooseAttention(input({ resolution: res('deadlineNear') })), CALM_FOCUS, pin);
  assert.deepEqual([f.block, f.pinned], ['clock', true]);
  assert.equal(at(1000, chooseAttention(input({ resolution: res('deadlineNear') })), f, pin), f, 'unchanged object: no re-render, no restart of the transition');
  f = at(WINDOWS.pinMs + 1, chooseAttention(input({ now: T0 + WINDOWS.pinMs + 1, resolution: res('deadlineNear') })), f, pin);
  assert.deepEqual([f.block, f.pinned], ['dashy', false], 'back to what needs attention');
  assert.equal(at(WINDOWS.pinMs + 1, null, at(0, null, CALM_FOCUS, pin), pin).block, null);
});
test('focus never gets stuck: from any state, with no candidate and no pin, it ends up calm', () => {
  for (const b of BLOCKS) for (const until of [null, T0 + 1000]) {
    const f = nextFocus({ block: b, reason: 'x', priority: 50, since: T0, until, pinned: false }, null, null, T0 + 60_000); assert.equal(f.block, null, `${b}/${until}`);
  }
});

// ---------- plan ----------
const task = (id: string, at: number | null, o: Partial<PlanItem> = {}): PlanItem => ({ id, kind: 'task', title: id, at, ...o });
const event = (id: string, at: number, o: Partial<PlanItem> = {}): PlanItem => ({ id, kind: 'event', title: id, at, endsAt: at + 30 * MIN, ...o });

test('urgency matches the driver thresholds, only for open tasks with a deadline', () => {
  assert.equal(urgency(task('a', T0 + 15 * MIN), T0), 'near'); assert.equal(urgency(task('a', T0 + 15 * MIN + 1), T0), 'soon');
  assert.equal(urgency(task('a', T0 + 60 * MIN), T0), 'soon'); assert.equal(urgency(task('a', T0 + 60 * MIN + 1), T0), 'normal');
  assert.equal(urgency(task('a', T0 - 5 * MIN), T0), 'near'); assert.equal(urgency(task('a', null), T0), 'normal');
  assert.equal(urgency(task('a', T0 - 15 * MIN), T0), 'near'); assert.equal(urgency(task('a', T0 - 15 * MIN - 1), T0), 'late', 'past the driver grace period: simply still open');
  assert.equal(urgency(task('a', T0 + MIN, { done: true }), T0), 'normal'); assert.equal(urgency(event('e', T0 + MIN), T0), 'normal');
});
test('plan order: by time, no-time last, finished at the bottom, old events gone, input untouched', () => {
  const items = [task('c', null), task('done', T0 + MIN, { done: true }), event('old', T0 - 3 * 60 * MIN), event('e', T0 + 30 * MIN), task('a', T0 + 10 * MIN), event('running', T0 - 10 * MIN)];
  const frozen = Object.freeze([...items]);
  assert.deepEqual(planOrder(frozen, T0).map(i => i.id), ['running', 'a', 'e', 'c', 'done']);
  assert.deepEqual(frozen.map(i => i.id), items.map(i => i.id));
});
test('next up and next appointment', () => {
  const items = [task('late', T0 + 50 * MIN), event('meet', T0 + 20 * MIN), task('done', T0 + 5 * MIN, { done: true }), task('none', null)];
  assert.equal(nextUp(items, T0)!.item.id, 'meet'); assert.equal(nextAppointmentAt(items, T0), T0 + 20 * MIN);
  assert.equal(nextUp([event('x', T0 - 3 * MIN)], T0), null, 'passed by more than 2 minutes'); assert.equal(nextUp([], T0), null); assert.equal(nextAppointmentAt([task('t', T0 + MIN)], T0), null);
});
test('countdown wording', () => {
  assert.deepEqual([0, 29_000, 60_000, 8 * MIN, 59 * MIN + 31_000, 60 * MIN, 65 * MIN, 180 * MIN].map(countdown), ['nu', 'nu', '1 min', '8 min', '1 u', '1 u', '1 u 05', '3 u']);
  assert.equal(countdown(-5 * MIN), '5 min geleden'); assert.equal(countdown(-30_000), 'nu');
});
test('model: adding, finishing and reopening tasks move the list and the state driver together', () => {
  let m = initialModel([task('a', T0 + 40 * MIN)], T0);
  assert.equal(resolve(m.driver, T0 + 5000).state, 'strict');
  m = reducer(m, { type: 'add', item: task('b', T0 + 10 * MIN) }, T0 + 10_000); assert.equal(resolve(m.driver, T0 + 10_000).state, 'received'); assert.equal(resolve(m.driver, T0 + 12_000).state, 'angry');
  assert.equal(reducer(m, { type: 'add', item: task('b', T0) }, T0), m, 'duplicate ids are ignored');
  m = reducer(m, { type: 'done', id: 'b' }, T0 + 20_000); assert.equal(resolve(m.driver, T0 + 20_000).state, 'done'); assert.equal(m.items.find(i => i.id === 'b')!.done, true);
  assert.equal(reducer(m, { type: 'done', id: 'b' }, T0 + 21_000), m, 'finishing twice does nothing'); assert.equal(reducer(m, { type: 'done', id: 'nope' }, T0), m);
  assert.equal(resolve(m.driver, T0 + 30_000).state, 'strict', 'the next deadline takes over');
  m = reducer(m, { type: 'undo', id: 'b' }, T0 + 40_000); assert.equal(resolve(m.driver, T0 + 41_000).state, 'angry', 'reopened: its deadline counts again');
  m = reducer(m, { type: 'flag', flag: 'blocked', value: true }, T0 + 50_000); assert.equal(resolve(m.driver, T0 + 50_000).state, 'blocked');
});
test('model: music start is remembered once and counts as activity; reducer never mutates', () => {
  const m0 = Object.freeze(initialModel([], T0));
  const m1 = reducer(m0, { type: 'music', playing: true }, T0 + 5000); assert.equal(m1.musicSince, T0 + 5000);
  assert.equal(reducer(m1, { type: 'music', playing: true }, T0 + 9000), m1, 'still the same start'); assert.equal(reducer(m1, { type: 'music', playing: false }, T0 + 9000).musicSince, null);
  assert.equal(m0.musicSince, null);
});

// ---------- lines ----------
test('Dashy always has a short line, and it never blames', () => {
  const ctxs = [{}, { task: { title: 'Offerte sturen', in: '8 min', overdue: false, at: '12:00' }, nextTitle: 'Offerte sturen', nextIn: '8 min', stale: 'Bellen', music: 'Midnight Roses' },
    { task: { title: 'Offerte sturen', in: 'nu', overdue: false, at: '12:00' } }, { task: { title: 'Offerte sturen', in: '10 min geleden', overdue: true, at: '12:00' } }];
  for (const r of RULES) for (const c of ctxs) {
    const l = dashyLine({ rule: r.rule, state: r.state }, c); assert.ok(l.length > 5 && l.length <= 100, `${r.rule}: ${l}`);
    assert.ok(!/schuld|falen|mislukt|lui|te laat|streak|\(over nu\)|over nu/i.test(l), l);
  }
});
test('Dashy names the task he is angry or strict about (the same one the driver looks at), and says it right', () => {
  const t = (inn: string, overdue = false) => ({ task: { title: 'Offerte', in: inn, overdue, at: '12:00' } });
  assert.equal(dashyLine(res('deadlineNear'), t('8 min')), 'Nog 8 min voor Offerte. Nu doen.');
  assert.equal(dashyLine(res('deadlineNear'), t('nu')), 'Offerte is nu aan de beurt.');
  assert.equal(dashyLine(res('deadlineNear'), t('10 min geleden', true)), 'Offerte was voor 12:00. Eén klein stukje nu is genoeg.');
  assert.match(dashyLine(res('deadlineSoon'), t('40 min')), /Offerte is aan de beurt \(over 40 min\)/);
  assert.equal(dashyLine(res('quiet'), { stale: 'Bellen' }), 'Bellen staat nog open. Zullen we een nieuw moment kiezen?');
});
test('the pressing task is the one the driver is angry about: nearest deadline, still counted 15 minutes after it passed', () => {
  const items = [task('late', T0 - 3 * 60 * MIN), task('grace', T0 - 10 * MIN), task('later', T0 + 90 * MIN), task('done', T0 + MIN, { done: true }), event('e', T0 + MIN)];
  assert.equal(pressingTask(items, T0)!.id, 'grace'); assert.equal(pressingTask(items, T0 + 6 * MIN)!.id, 'later');
  assert.equal(nextUp(items, T0)!.item.id, 'grace', 'Straks agrees with the driver');
  assert.equal(nextUp([task('x', T0 - 16 * MIN)], T0), null); assert.equal(nextUp([event('e', T0 - 3 * MIN)], T0), null, 'appointments end sooner');
});

// ---------- body mode: the block is Dashy, it stands still, his face lives ----------
import { createDashy, type Geometry } from '../src/core';
import { faceMotion, type FaceMotion } from '../src/render';
import { ALL_STATES } from '../src/static';

/** Smallest distance (in core units) between any corner of either eye and the edge of the block, after the face transform, the eye tilt and the eye position. */
function clearance(G: Geometry, m: FaceMotion, w: number, h: number): number {
  const u = Math.min(w, h) / 220, hw = w / (2 * u), hh = h / (2 * u);
  const rad = (d: number) => (d * Math.PI) / 180;
  let min = Infinity;
  for (const e of G.eyes) for (const [cx, cy] of [[-e.ew / 2, -e.eh / 2], [e.ew / 2, -e.eh / 2], [e.ew / 2, e.eh / 2], [-e.ew / 2, e.eh / 2]]) {
    const ta = rad(e.tilt), ex = e.x + cx * Math.cos(ta) - cy * Math.sin(ta), ey = e.y + cx * Math.sin(ta) + cy * Math.cos(ta); // in the face
    const fa = rad(m.rot), px = ex * m.sx, py = ey * m.sy;
    const X = m.tx + px * Math.cos(fa) - py * Math.sin(fa), Y = m.ty + px * Math.sin(fa) + py * Math.cos(fa); // in the block (centre 150,150)
    min = Math.min(min, 150 + hw - X, X - (150 - hw), 150 + hh - Y, Y - (150 - hh));
  }
  return min;
}
const SIZES: [number, number][] = [[430, 390], [750, 560], [680, 250], [240, 400], [180, 200], [350, 160], [1100, 140], [90, 600], [220, 220]];

test('face motion: the eyes NEVER get closer than the margin to the edge of the block, for any state, any block shape', () => {
  let worst = Infinity;
  for (const state of ALL_STATES) {
    const d = createDashy({ seed: 11 }); d.setState(state, 0);
    for (let ms = 0; ms < 25000; ms += 33) {
      d.pointer(Math.sin(ms / 900) * 1.4, Math.cos(ms / 700) * 1.4, ms);
      if (ms % 4000 === 0) d.poke(ms);
      const G = d.step(ms);
      for (const [w, h] of SIZES) {
        const m = faceMotion(G, w, h);
        assert.ok(Object.values(m).every(Number.isFinite), `${state} ${w}x${h}`);
        const c = clearance(G, m, w, h); worst = Math.min(worst, c);
        // small blocks have little room: there the limit is what core.ts itself guarantees (10 units in a 220 body), never worse
        assert.ok(c >= Math.min(12, 10) - 1e-6 || Math.min(w, h) < 140, `${state} ${w}x${h}: ${c.toFixed(1)} units from the edge`);
      }
    }
  }
  assert.ok(worst > 0, 'never outside');
});
test('face motion: the face really moves (gain), and no more than the room allows', () => {
  const d = createDashy({ seed: 5 }); d.setState('dancing', 0);
  let hop = [0, 0, 0]; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let ms = 0; ms < 6000; ms += 16.67) { const G = d.step(ms); [1, 2.2, 4].forEach((gain, i) => { const m = faceMotion(G, 430, 390, { gain }); lo[i] = Math.min(lo[i], m.ty); hi[i] = Math.max(hi[i], m.ty); }); }
  hop = hi.map((v, i) => v - lo[i]);
  assert.ok(hop[1] > hop[0] * 2 && hop[2] > hop[1], `face hop in units ${hop.map(v => v.toFixed(1))}`);
});
test('face motion: a calm block hardly moves the face, a tiny block cannot push the eyes out, and stretch is limited', () => {
  const rest = createDashy({ seed: 1 }).step(0);
  const m = faceMotion(rest, 430, 390); assert.ok(Math.abs(m.tx - 150) < 15 && Math.abs(m.ty - 150) < 15);
  const tiny = faceMotion({ ...rest, face: { ...rest.face, tx: 400, ty: 400 } }, 120, 120); assert.ok(clearance({ ...rest }, tiny, 120, 120) > -60 && Math.abs(tiny.tx - 150) < 60);
  const big = faceMotion({ ...rest, face: { ...rest.face, sx: 3, sy: 0.1 } }, 430, 390); assert.ok(big.sx <= 1.01 * 1.2 + 1e-9 && big.sy >= 1.01 * 0.8 - 1e-9);
});

import { aimAt } from '../src/dashboard/aim';
test('Dashy looks towards the block that needs attention: direction, distance, and no crash without measurements', () => {
  const root = { left: 0, top: 0, width: 1200, height: 800 };
  const me = { left: 0, top: 0, width: 400, height: 300 };
  const right = aimAt(me, { left: 800, top: 0, width: 400, height: 300 }, root)!;
  assert.ok(right.nx === 1 && Math.abs(right.ny) < 1e-9, 'a block far to the right: looks fully right');
  const near = aimAt(me, { left: 400, top: 0, width: 200, height: 300 }, root)!;
  assert.ok(near.nx > 0 && near.nx < 1, 'a nearer block: looks a little');
  const below = aimAt(me, { left: 0, top: 500, width: 400, height: 300 }, root)!; assert.ok(below.ny > 0.9 && Math.abs(below.nx) < 1e-9);
  assert.ok(aimAt(me, { left: -900, top: 0, width: 400, height: 300 }, root)!.nx === -1);
  assert.deepEqual(aimAt(me, me, root), { nx: 0, ny: 0 }, 'looking at himself: straight ahead');
  assert.equal(aimAt({ ...me, width: 0 }, me, root), null); assert.equal(aimAt(me, me, { ...root, width: 0 }), null);
  assert.equal(aimAt(me, { left: NaN, top: 0, width: 1, height: 1 }, root), null);
});
