import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputError, parseDay, checkMinutes, checkProject, checkDescription } from '../src/server/model';
import { addTasks, dashboard, editTime, logTime, markBooked, timeLog, updateTasks, weekReview } from '../src/server/ops';
import { orderTasks, hoursOf, buildState } from '../src/server/plan';
import { modeAt, DEFAULT_WORKDAY } from '../src/server/workday';
import { MemoryStore, SupabaseStore, UpstashStore, parseEntry } from '../src/server/store';
import { handleMcp } from '../src/server/mcp';
import { zonedToEpoch } from '../src/server/time';

const at = (d: string, t = '00:00') => { const [y, m, da] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number); return zonedToEpoch(y, m, da, h, mi)!; };
const FRI = '2026-10-16', NOW = at(FRI, '15:00');
const task = (o: object = {}) => ({ id: 'x', title: 't', category: 'thuis' as const, dueAt: null, hasTime: false, note: null, done: false, doneAt: null, position: 0, createdAt: 0, ...o });

// ---- validation
test('hours validation: minutes, project, description, day', () => {
  assert.equal(checkMinutes(1), 1); assert.equal(checkMinutes(960), 960);
  for (const bad of [0, -5, 961, 1.5, '30', NaN, null]) assert.throws(() => checkMinutes(bad), InputError, String(bad));
  assert.equal(checkProject('  Klant   A '), 'Klant A'); for (const bad of ['', '  ', 'x'.repeat(61), 5]) assert.throws(() => checkProject(bad), InputError);
  assert.equal(checkDescription(' Rapport  schrijven '), 'Rapport schrijven'); for (const bad of ['', 'x'.repeat(121), null]) assert.throws(() => checkDescription(bad), InputError);
  assert.equal(parseDay(FRI, NOW), FRI); assert.equal(parseDay('2026-10-01', NOW), '2026-10-01');
  for (const bad of ['2026-10-17', '2026-02-30', '2026-7-1', 'gisteren', 5, '2026-07-01']) assert.throws(() => parseDay(bad, NOW), InputError, String(bad));
});

// ---- log_time
test('log_time: logs hours with today as the default day, a task title as description, and nothing on a bad batch', async () => {
  const s = new MemoryStore();
  const { added } = await addTasks(s, { tasks: [{ title: 'Rapport schrijven', category: 'werk' }] }, NOW);
  const r = await logTime(s, { entries: [{ minutes: 90, project: 'Klant A', description: 'Rapport' }, { minutes: 30, task: added[0].id }, { minutes: 45, project: 'Klant B', description: 'Mail', day: '2026-10-15' }] }, NOW);
  assert.equal(r.logged.length, 3); assert.equal(r.vandaag_min, 120);
  const e = await s.entries(); assert.equal(e.find(x => x.minutes === 30)!.description, 'Rapport schrijven'); assert.equal(e.find(x => x.minutes === 30)!.taskId, added[0].id); assert.equal(e.find(x => x.minutes === 45)!.day, '2026-10-15');
  assert.ok(e.every(x => !x.booked && x.createdAt === NOW));
  await assert.rejects(logTime(s, { entries: [{ minutes: 10, description: 'ok' }, { minutes: 0, description: 'fout' }] }, NOW), /item 2: .*minutes/);
  await assert.rejects(logTime(s, { entries: [{ minutes: 10 }] }, NOW), /description is nodig/);
  await assert.rejects(logTime(s, { entries: [{ minutes: 10, task: 'nope' }] }, NOW), /bestaat niet/);
  await assert.rejects(logTime(s, { entries: [{ minutes: 10, description: 'x', day: '2026-10-20' }] }, NOW), /toekomst/);
  await assert.rejects(logTime(s, { entries: [{ minutes: 10, description: 'x', extra: 1 }] }, NOW), /onbekend veld/);
  await assert.rejects(logTime(s, { entries: Array.from({ length: 21 }, () => ({ minutes: 1, description: 'x' })) }, NOW), /maximaal 20/);
  assert.equal((await s.entries()).length, 3, 'the failed batches changed nothing');
});

// ---- edit / book / log
test('edit_time and mark_booked: correct, move, remove, and book by ids or by day and project', async () => {
  const s = new MemoryStore();
  await logTime(s, { entries: [{ minutes: 60, project: 'A', description: 'a1' }, { minutes: 30, project: 'A', description: 'a2' }, { minutes: 45, project: 'B', description: 'b1' }, { minutes: 20, description: 'zonder project' }] }, NOW);
  const all = await s.entries(), id = (d: string) => all.find(e => e.description === d)!.id;
  await editTime(s, { edits: [{ id: id('a1'), minutes: 75, project: 'C' }, { id: id('zonder project'), remove: true }, { id: id('b1'), project: null, day: '2026-10-15' }] }, NOW);
  const e = await s.entries(); assert.equal(e.length, 3); assert.deepEqual([e.find(x => x.description === 'a1')!.minutes, e.find(x => x.description === 'a1')!.project], [75, 'C']);
  assert.deepEqual([e.find(x => x.description === 'b1')!.project, e.find(x => x.description === 'b1')!.day], [null, '2026-10-15']);
  await assert.rejects(editTime(s, { edits: [{ id: id('a2'), minutes: 5 }, { id: 'nope', minutes: 5 }] }, NOW), /bestaat niet/);
  assert.equal((await s.entries()).find(x => x.description === 'a2')!.minutes, 30, 'nothing applied');
  assert.deepEqual(await markBooked(s, { day: FRI, project: 'C' }, NOW), { gemarkeerd: 1, min: 75 });
  assert.deepEqual((await s.entries()).filter(x => x.booked).map(x => x.description), ['a1']);
  assert.deepEqual(await markBooked(s, { ids: [id('a2'), id('b1')] }, NOW), { gemarkeerd: 2, min: 75 });
  assert.ok((await s.entries()).every(x => x.booked));
  await markBooked(s, { day: FRI, booked: false }, NOW); assert.equal((await s.entries()).filter(x => !x.booked).length, 2, 'booked:false takes the mark away');
  await assert.rejects(markBooked(s, {}, NOW), /ids of een day/); await assert.rejects(markBooked(s, { ids: ['nope'] }, NOW), /geen uren-regel/); await assert.rejects(markBooked(s, { day: '2026-12-01' }, NOW), InputError);
});
test('time_log: one day, totals, per project and what is still to book from earlier days', async () => {
  const s = new MemoryStore();
  await logTime(s, { entries: [{ minutes: 60, project: 'A', description: 'x' }, { minutes: 30, project: 'A', description: 'y' }, { minutes: 15, description: 'z' }, { minutes: 120, project: 'B', description: 'oud', day: '2026-10-14' }] }, NOW);
  await markBooked(s, { day: FRI, project: 'A' }, NOW).then(() => logTime(s, { entries: [{ minutes: 10, project: 'A', description: 'nieuw' }] }, NOW));
  const t = await timeLog(s, {}, NOW);
  assert.equal(t.totaal_min, 115); assert.equal(t.te_boeken_min, 25); assert.deepEqual(t.per_project, [['A', 100, 10], [null, 15, 15]]); assert.equal(t.eerder_te_boeken_min, 120); assert.equal(t.regels.length, 4);
  assert.equal((await timeLog(s, { day: '2026-10-14' }, NOW)).totaal_min, 120); assert.equal((await timeLog(s, { day: '2026-10-13' }, NOW)).regels.length, 0);
});
test('the state carries today\'s hours and what is still to book', async () => {
  const s = new MemoryStore();
  await logTime(s, { entries: [{ minutes: 60, project: 'A', description: 'x' }, { minutes: 30, description: 'y' }, { minutes: 200, project: 'B', description: 'oud', day: '2026-10-14' }] }, NOW);
  const d = await dashboard(s, NOW);
  assert.deepEqual(d.hours, { day: FRI, totalMin: 90, unbookedMin: 90, perProject: [{ project: 'A', minutes: 60, unbookedMin: 60 }, { project: null, minutes: 30, unbookedMin: 30 }], olderUnbookedMin: 200 });
  assert.deepEqual(hoursOf([], FRI), { day: FRI, totalMin: 0, unbookedMin: 0, perProject: [], olderUnbookedMin: 0 });
});
test('booked hours are kept 120 days and unbooked ones never dropped', async () => {
  const s = new MemoryStore();
  await s.putEntries([{ id: 'old1', day: '2026-05-01', project: null, description: 'oud geboekt', minutes: 5, booked: true, taskId: null, createdAt: 1 }, { id: 'old2', day: '2026-05-01', project: null, description: 'oud open', minutes: 5, booked: false, taskId: null, createdAt: 1 }]);
  await logTime(s, { entries: [{ minutes: 1, description: 'nu' }] }, NOW);
  assert.deepEqual((await s.entries()).map(e => e.id).filter(i => i.startsWith('old')), ['old2']);
});

// ---- free time
test('free time: after the working day and on days off, work tasks wait (unless they have a time tonight)', () => {
  const FRI_EVE = at(FRI, '18:00'), SAT = at('2026-10-17', '11:00'), EARLY = at(FRI, '07:00');
  assert.equal(modeAt(EARLY, DEFAULT_WORKDAY), 'work', 'before the day starts still counts as work'); assert.equal(modeAt(at(FRI, '10:00')), 'work'); assert.equal(modeAt(at(FRI, '17:00')), 'free'); assert.equal(modeAt(FRI_EVE), 'free'); assert.equal(modeAt(SAT), 'free');
  const tasks = [task({ id: 'w', category: 'werk', position: 1 }), task({ id: 'h', category: 'thuis', position: 2 }), task({ id: 's', category: 'sport', position: 3 }), task({ id: 'wd', category: 'werk', dueAt: at(FRI, '20:00'), hasTime: true, position: 4 }), task({ id: 'wl', category: 'werk', dueAt: at('2026-10-17', '09:00'), hasTime: true, position: 5 })];
  const free = orderTasks(tasks, at(FRI, '19:30'), 'free'); assert.deepEqual(free.ready.map(t => t.id), ['wd', 'h', 's']); assert.equal(free.waiting, 2, 'two work tasks wait: one without a time and one for tomorrow'); assert.deepEqual(free.planned.map(t => t.id), []);
  const work = orderTasks(tasks, at(FRI, '10:00'), 'work'); assert.deepEqual(work.ready.map(t => t.id), ['w', 'h', 's']); assert.equal(work.waiting, 0);
});
test('free time in the state: mode, how many work tasks wait, and the mode flips back on Monday morning', async () => {
  const s = new MemoryStore();
  await addTasks(s, { tasks: [{ title: 'Mailen', category: 'werk' }, { title: 'Wassen', category: 'thuis' }] }, NOW);
  const eve = await dashboard(s, at(FRI, '18:30')); assert.equal(eve.mode, 'free'); assert.equal(eve.waiting, 1); assert.deepEqual(eve.tasks.map(t => t.title), ['Wassen']);
  const mon = await dashboard(s, at('2026-10-19', '09:00')); assert.equal(mon.mode, 'work'); assert.equal(mon.waiting, 0); assert.equal(mon.tasks.length, 2);
  const sun = await dashboard(s, at('2026-10-18', '12:00')); assert.equal(sun.mode, 'free');
  assert.equal(buildState([], null, at(FRI, '10:00')).mode, 'work');
});

// ---- the week review
test('week_review: the facts of a week, per category, day and part of the day, with hours and what is still open', async () => {
  const s = new MemoryStore();
  const mk = (id: string, title: string, category: 'werk' | 'thuis' | 'sport' | 'prive', doneAt: number | null, dueAt: number | null = null) => task({ id, title, category, done: doneAt !== null, doneAt, dueAt });
  await s.putTasks([
    mk('a', 'Rapport', 'werk', at('2026-10-12', '09:30')), mk('b', 'Mailen', 'werk', at('2026-10-12', '14:00')), mk('c', 'Wassen', 'thuis', at('2026-10-14', '19:30')),
    mk('d', 'Hardlopen', 'sport', at('2026-10-15', '07:15')), mk('e', 'Bellen', 'prive', at('2026-10-18', '23:30')),
    mk('old', 'Vorige week', 'werk', at('2026-10-09', '10:00')), mk('next', 'Volgende week', 'werk', at('2026-10-19', '09:00')),
    mk('o1', 'Nog open', 'thuis', null, at('2026-10-13', '19:00')), mk('o2', 'Morgen', 'thuis', null, at('2026-10-17', '10:00')),
  ]);
  await logTime(s, { entries: [{ minutes: 120, project: 'A', description: 'x', day: '2026-10-12' }, { minutes: 60, project: 'A', description: 'y', day: '2026-10-14' }, { minutes: 45, project: 'B', description: 'z', day: '2026-10-14' }, { minutes: 480, description: 'vorige week', day: '2026-10-09' }] }, at(FRI, '17:00'));
  await markBooked(s, { day: '2026-10-12' }, at(FRI, '17:00'));
  const r = await weekReview(s, {}, at(FRI, '17:00'));
  assert.deepEqual(r.week, { van: '2026-10-12', tot: '2026-10-18', loopt_nog: true });
  assert.equal(r.gedaan.totaal, 5); assert.deepEqual(r.gedaan.per_categorie, { werk: 2, thuis: 1, sport: 1, prive: 1 });
  assert.deepEqual(r.gedaan.per_dag, { ma: 2, di: 0, wo: 1, do: 1, vr: 0, za: 0, zo: 1 }); assert.deepEqual(r.gedaan.per_dagdeel, { ochtend: 2, middag: 1, avond: 2 });
  assert.deepEqual(r.gedaan.titels, ['Rapport', 'Mailen', 'Wassen', 'Hardlopen', 'Bellen']);
  assert.equal(r.uren.totaal_min, 225); assert.equal(r.uren.te_boeken_min, 105); assert.deepEqual(r.uren.per_project, [['A', 180, 60], ['B', 45, 45]]);
  assert.equal(r.nog_open_uit_deze_week, 1, 'only what was due earlier in that week: "Nog open"; tomorrow\'s task is not open from before');
  // another week, by any date in it
  const prev = await weekReview(s, { week_of: '2026-10-09' }, NOW); assert.deepEqual(prev.week, { van: '2026-10-05', tot: '2026-10-11', loopt_nog: false }); assert.equal(prev.gedaan.totaal, 1); assert.equal(prev.uren.totaal_min, 480);
  assert.equal((await weekReview(s, { week_of: '2026-10-18' }, NOW)).week.van, '2026-10-12', 'a Sunday belongs to the week before it');
  await assert.rejects(weekReview(s, { week_of: '2026-12-01' }, NOW), InputError); await assert.rejects(weekReview(s, { extra: 1 }, NOW), /onbekend veld/);
  const empty = await weekReview(new MemoryStore(), {}, NOW); assert.equal(empty.gedaan.totaal, 0); assert.equal(empty.uren.totaal_min, 0);
});
test('no judgement in the week review: only facts, no score fields', async () => {
  const r = await weekReview(new MemoryStore(), {}, NOW), text = JSON.stringify(r).toLowerCase();
  for (const bad of ['score', 'streak', 'achter', 'te laat', 'slecht']) assert.ok(!text.includes(bad), bad);
});

// ---- over MCP
const TOKEN = 'mcp-token-0123456789abcdef';
const rpc = (s: MemoryStore, name: string, args: unknown) => handleMcp(new Request('https://x.test/api/mcp', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), { store: s, token: TOKEN, now: () => NOW }).then(r => r.json() as Promise<any>);
test('hours and the week review work over MCP, and mistakes come back as text', async () => {
  const s = new MemoryStore();
  const logged = JSON.parse((await rpc(s, 'log_time', { entries: [{ minutes: 90, project: 'Klant A', description: 'Rapport' }] })).result.content[0].text); assert.equal(logged.vandaag_min, 90);
  const tl = JSON.parse((await rpc(s, 'time_log', {})).result.content[0].text); assert.equal(tl.te_boeken_min, 90);
  const bad = await rpc(s, 'log_time', { entries: [{ minutes: 5000, description: 'x' }] }); assert.equal(bad.result.isError, true); assert.match(bad.result.content[0].text, /^Ongeldig: item 1: minutes/);
  assert.equal(JSON.parse((await rpc(s, 'mark_booked', { day: FRI })).result.content[0].text).gemarkeerd, 1);
  assert.equal(JSON.parse((await rpc(s, 'week_review', {})).result.content[0].text).uren.totaal_min, 90);
  const dash = JSON.parse((await rpc(s, 'dashboard', {})).result.content[0].text); assert.equal(dash.hours.totalMin, 90); assert.equal(dash.hours.unbookedMin, 0); assert.equal(dash.mode, 'work');
});

// ---- the other stores
test('entries round trip through Upstash and Supabase (fakes), and a damaged record is skipped', async () => {
  const h = new Map<string, Map<string, string>>();
  const redis = (async (_u: string, init: RequestInit) => new Response(JSON.stringify((JSON.parse(init.body as string) as string[][]).map(([c, k, ...a]) => {
    if (c === 'HSET') { const m = h.get(k) ?? new Map(); for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]); h.set(k, m); return { result: 1 }; }
    if (c === 'HGETALL') return { result: [...(h.get(k) ?? new Map()).entries()].flat() };
    if (c === 'HDEL') { a.forEach(x => h.get(k)?.delete(x)); return { result: 1 }; }
    return { result: null };
  })))) as typeof fetch;
  const u = new UpstashStore({ url: 'https://r.test', token: 't', fetch: redis });
  await logTime(u, { entries: [{ minutes: 15, project: 'A', description: 'x' }] }, NOW); h.get('dashy:v2:time')!.set('bad', '{"id":1}');
  assert.deepEqual((await u.entries()).map(e => [e.minutes, e.project, e.booked]), [[15, 'A', false]]);
  await u.deleteEntries([(await u.entries())[0].id]); assert.equal((await u.entries()).length, 0);

  const rows = new Map<string, any>();
  const pg = (async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : null, q = new URL(url);
    if (init.method === 'POST') { for (const r of body) rows.set(r.id, r); return new Response(null, { status: 201 }); }
    if (init.method === 'DELETE') { /^in\.\((.*)\)$/.exec(q.searchParams.get('id') ?? '')![1].split(',').forEach(i => rows.delete(i)); return new Response(null, { status: 204 }); }
    return new Response(JSON.stringify([...rows.values(), { id: 5 }]), { status: 200 });
  }) as typeof fetch;
  const sb = new SupabaseStore({ url: 'https://p.test', serviceKey: 'k', fetch: pg });
  await logTime(sb, { entries: [{ minutes: 20, project: null, description: 'y', day: '2026-10-15' }] }, NOW);
  const got = await sb.entries(); assert.deepEqual(got.map(e => [e.minutes, e.day, e.project]), [[20, '2026-10-15', null]]); assert.equal(parseEntry('{"id":"a"}'), null);
  await markBooked(sb, { day: '2026-10-15' }, NOW); assert.equal(rows.get(got[0].id).booked, true, 'an update is an upsert');
  await assert.rejects(sb.deleteEntries(['a),id=neq.(b']), /unsafe id/);
});

// ---- the client side of hours and free time
import { parseDashboard, TASK_DRIVER_CONFIG, FREE_TIME_DRIVER_CONFIG } from '../src/tasks';
import { isBookingTime, BOOKING_LEAD_MS } from '../src/day';
import { initialDriverState, resolve } from '../src/driver';

test('the client reads hours, mode and waiting, with safe defaults for anything missing or broken', async () => {
  const s = new MemoryStore();
  await logTime(s, { entries: [{ minutes: 90, project: 'A', description: 'x' }, { minutes: 30, description: 'y', day: '2026-10-15' }] }, at(FRI, '18:30'));
  await addTasks(s, { tasks: [{ title: 'Mailen', category: 'werk' }] }, NOW);
  const snap = parseDashboard(JSON.stringify(await dashboard(s, at(FRI, '18:30'))));
  assert.equal(snap.mode, 'free'); assert.equal(snap.waiting, 1); assert.deepEqual(snap.hours, { day: FRI, totalMin: 90, unbookedMin: 90, perProject: [{ project: 'A', minutes: 90, unbookedMin: 90 }], olderUnbookedMin: 30 });
  const bare = parseDashboard({ v: 2, today: FRI, now: NOW, tasks: [] }); assert.equal(bare.mode, 'work'); assert.equal(bare.waiting, 0); assert.equal(bare.hours.totalMin, 0);
  const broken = parseDashboard({ v: 2, today: FRI, now: NOW, tasks: [], mode: 'party', waiting: -3, hours: { totalMin: 'x', perProject: [{ minutes: 'a' }, null, { project: 5, minutes: 10, unbookedMin: 'z' }] } });
  assert.equal(broken.mode, 'work'); assert.equal(broken.waiting, 0); assert.deepEqual(broken.hours.perProject, [{ project: null, minutes: 10, unbookedMin: 0 }]); assert.equal(broken.hours.totalMin, 0);
  assert.equal(parseDashboard({ today: FRI, tasks: [], left_open: [] }).mode, 'work', 'the old format stays readable');
});
test('booking reminder: from 15 minutes before the end of the day until midnight, never on a day off or in the morning', () => {
  assert.equal(BOOKING_LEAD_MS, 900_000);
  assert.equal(isBookingTime(at(FRI, '10:00')), false); assert.equal(isBookingTime(at(FRI, '16:44')), false); assert.equal(isBookingTime(at(FRI, '16:45')), true); assert.equal(isBookingTime(at(FRI, '19:00')), true); assert.equal(isBookingTime(at(FRI, '23:59')), true);
  assert.equal(isBookingTime(at(FRI, '07:00')), false); assert.equal(isBookingTime(at('2026-10-17', '16:50')), false);
});
test('in free time a quiet evening does not make him sad, but in work time it does', () => {
  const t0 = at(FRI, '17:30'), s = initialDriverState(t0);
  assert.equal(resolve(s, t0 + 3 * 3600_000, TASK_DRIVER_CONFIG).state, 'sad'); assert.equal(resolve(s, t0 + 3 * 3600_000, FREE_TIME_DRIVER_CONFIG).state, 'idle');
  assert.equal(resolve(s, t0 + 30 * 24 * 3600_000, FREE_TIME_DRIVER_CONFIG).state, 'idle');
});

// ---- a missing hours table must never take the dashboard down
test('without hours storage the dashboard still works, and the hour tools say what to do', async () => {
  const s = new MemoryStore(); const broken = { async entries() { throw new Error('storage status 404'); }, async putEntries() { throw new Error('storage status 404'); }, async deleteEntries() { throw new Error('x'); } };
  const store = Object.assign(Object.create(Object.getPrototypeOf(s)), s, broken) as MemoryStore;
  await addTasks(store, { tasks: [{ title: 'Wassen', category: 'thuis' }] }, NOW);
  const d = await dashboard(store, NOW);
  assert.deepEqual(d.tasks.map(t => t.title), ['Wassen']); assert.equal(d.hours.totalMin, 0); assert.equal(d.mode, 'work');
  for (const call of [() => logTime(store, { entries: [{ minutes: 5, description: 'x' }] }, NOW), () => timeLog(store, {}, NOW), () => markBooked(store, { day: FRI }, NOW), () => editTime(store, { edits: [{ id: 'a', minutes: 5 }] }, NOW), () => weekReview(store, {}, NOW)])
    await assert.rejects(call(), /uren-opslag is nog niet ingesteld.*dashy_time/);
  const text = JSON.parse(JSON.stringify(await rpc(store as never, 'log_time', { entries: [{ minutes: 5, description: 'x' }] })));
  assert.equal(text.result.isError, true); assert.match(text.result.content[0].text, /^Ongeldig: De uren-opslag is nog niet ingesteld/);
  const st = await handleMcp(new Request('https://x.test/api/state', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'dashboard', arguments: {} } }) }), { store, token: TOKEN, now: () => NOW });
  assert.equal(JSON.parse(((await st.json()) as any).result.content[0].text).tasks.length, 1, 'the dashboard tool works too');
});
