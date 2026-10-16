import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localParts, zonedToEpoch, startOfDay } from '../src/server/time';
import { checkTitle, InputError, parseDue, newId } from '../src/server/model';
import { buildState, isReady, orderTasks, readyAt } from '../src/server/plan';
import { addTasks, dashboard, reorderTasks, setAppointment, updateTasks } from '../src/server/ops';
import { MemoryStore, UpstashStore, parseTask, type Store } from '../src/server/store';
import { handleMcp, handleState } from '../src/server/mcp';
import { parseDashboard, snapshotEvents, whenLabel } from '../src/tasks';

const at = (s: string, tz = 'Europe/Amsterdam') => { const [d, t = '00:00'] = s.split(' '); const [y, mo, da] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number); return zonedToEpoch(y, mo, da, h, mi, tz)!; };
const NOW = at('2026-10-16 10:00'); // Friday

// ---- time
test('time: Dutch wall clock is right in summer and winter', () => {
  assert.equal(new Date(at('2026-10-16 19:00')).toISOString(), '2026-10-16T17:00:00.000Z'); // CEST +2
  assert.equal(new Date(at('2026-12-01 19:00')).toISOString(), '2026-12-01T18:00:00.000Z'); // CET +1
  const p = localParts(at('2026-10-16 19:05')); assert.deepEqual([p.date, p.h, p.mi, p.weekday], ['2026-10-16', 19, 5, 5]);
});
test('time: the skipped hour does not exist, the repeated hour takes the first occurrence, bad dates are refused', () => {
  assert.equal(zonedToEpoch(2026, 3, 29, 2, 30, 'Europe/Amsterdam'), null);
  assert.equal(new Date(at('2026-03-29 03:30')).toISOString(), '2026-03-29T01:30:00.000Z');
  assert.equal(new Date(at('2026-10-25 02:30')).toISOString(), '2026-10-25T00:30:00.000Z'); // CEST, first of the two
  for (const [y, m, d, h, mi] of [[2026, 2, 30, 10, 0], [2026, 13, 1, 0, 0], [2026, 1, 1, 24, 0], [2026, 1, 1, 0, 60]]) assert.equal(zonedToEpoch(y, m, d, h, mi), null);
  assert.equal(new Date(startOfDay(at('2026-10-25 15:00'))).toISOString(), '2026-10-24T22:00:00.000Z', 'a 25 hour day starts at its own midnight');
});

// ---- model
test('titles: short, no clock time or date inside, cleaned up', () => {
  assert.equal(checkTitle('  Naar   oma '), 'Naar oma');
  for (const bad of ['', '   ', 'x'.repeat(61), 'Bellen om 18:00', 'Bellen 18.30', 'Doen op 2026-10-20', 5]) assert.throws(() => checkTitle(bad), InputError, String(bad));
  assert.equal(checkTitle('x'.repeat(60)).length, 60);
  assert.equal(checkTitle('Rij 3 keer'), 'Rij 3 keer');
});
test('due: a day without a time is not the same as 07:00', () => {
  assert.deepEqual(parseDue('2026-10-17 07:00', NOW), { dueAt: at('2026-10-17 07:00'), hasTime: true });
  assert.deepEqual(parseDue('2026-10-17', NOW), { dueAt: at('2026-10-17 00:00'), hasTime: false });
  assert.deepEqual(parseDue('2026-10-17T14:30', NOW), { dueAt: at('2026-10-17 14:30'), hasTime: true });
  assert.deepEqual(parseDue('19:00', NOW), { dueAt: at('2026-10-16 19:00'), hasTime: true });
  for (const bad of ['morgen 14:00', '2026-10-17 25:00', '2026-02-30', '2026-03-29 02:30', '', 7, null]) assert.throws(() => parseDue(bad, NOW), InputError, String(bad));
});
test('ids: 8 characters, no look-alikes, never a taken one', () => {
  const taken = new Set<string>(); for (let i = 0; i < 2000; i++) { const id = newId(taken); assert.match(id, /^[a-hj-km-np-z2-9]{8}$/); assert.ok(!taken.has(id)); taken.add(id); }
});

// ---- plan
const task = (o: Partial<import('../src/server/model').Task>) => ({ id: 'x', title: 't', category: 'thuis' as const, dueAt: null, hasTime: false, note: null, done: false, doneAt: null, position: 0, createdAt: 0, ...o });
test('plan: a timed task is "Straks" until an hour before, a date-only task from 07:00 that day', () => {
  const t = task({ dueAt: at('2026-10-16 19:00'), hasTime: true });
  assert.equal(readyAt(t), at('2026-10-16 18:00'));
  assert.equal(isReady(t, at('2026-10-16 17:59')), false); assert.equal(isReady(t, at('2026-10-16 18:00')), true);
  const day = task({ dueAt: at('2026-10-17 00:00'), hasTime: false });
  assert.equal(isReady(day, at('2026-10-17 06:59')), false); assert.equal(isReady(day, at('2026-10-17 07:00')), true);
  assert.equal(isReady(task({}), NOW), true);
});
test('plan: order = timed-and-ready by time, then the rest by position, then planned by moment', () => {
  const a = task({ id: 'a', position: 2 }), b = task({ id: 'b', position: 1 }), c = task({ id: 'c', dueAt: at('2026-10-16 10:30'), hasTime: true, position: 9 });
  const d = task({ id: 'd', dueAt: at('2026-10-18 09:00'), hasTime: true }), e = task({ id: 'e', dueAt: at('2026-10-17 09:00'), hasTime: true });
  const o = orderTasks([a, b, c, d, e], NOW);
  assert.deepEqual(o.ready.map(t => t.id), ['c', 'b', 'a']); assert.deepEqual(o.planned.map(t => t.id), ['e', 'd']);
});

// ---- ops
const fresh = () => new MemoryStore();
test('add_tasks: appends, now goes first in the given order, ids are unique', async () => {
  const s = fresh();
  await addTasks(s, { tasks: [{ title: 'Een', category: 'thuis' }, { title: 'Twee', category: 'werk' }] }, NOW);
  await addTasks(s, { tasks: [{ title: 'Drie', category: 'prive', now: true }, { title: 'Vier', category: 'prive', now: true }] }, NOW);
  const d = await dashboard(s, NOW);
  assert.deepEqual(d.tasks.map(t => t.title), ['Drie', 'Vier', 'Een', 'Twee']);
  assert.equal(new Set(d.tasks.map(t => t.id)).size, 4);
});
test('add_tasks: one bad item changes nothing and says which', async () => {
  const s = fresh();
  await assert.rejects(addTasks(s, { tasks: [{ title: 'Goed', category: 'thuis' }, { title: 'Fout om 18:00', category: 'thuis' }] }, NOW), /item 2: .*due/);
  assert.equal((await s.tasks()).length, 0);
  for (const bad of [{}, { tasks: [] }, { tasks: 'x' }, { tasks: [{ title: 'a', category: 'zzz' }] }, { tasks: [{ title: 'a', category: 'thuis', extra: 1 }] }, { tasks: Array.from({ length: 51 }, () => ({ title: 'a', category: 'thuis' })) }, { tasks: [{ title: 'a', category: 'thuis', note: 'n'.repeat(101) }] }, { tasks: [{ title: 'a', category: 'thuis', now: 'ja' }] }]) await assert.rejects(addTasks(s, bad, NOW), InputError);
});
test('update_tasks: done, move, clear, remove; unknown id refuses the whole batch', async () => {
  const s = fresh();
  const { added } = await addTasks(s, { tasks: [{ title: 'A', category: 'thuis', due: '2026-10-20 09:00', note: 'n' }, { title: 'B', category: 'werk' }] }, NOW);
  const [a, b] = added.map(x => x.id);
  await assert.rejects(updateTasks(s, { updates: [{ id: a, done: true }, { id: 'nope' }] }, NOW), /bestaat niet/);
  assert.equal((await s.tasks()).find(t => t.id === a)!.done, false, 'nothing applied');
  await updateTasks(s, { updates: [{ id: a, due: '2026-10-21', note: null, title: 'A2' }, { id: b, done: true }] }, NOW);
  const t = await s.tasks(), A = t.find(x => x.id === a)!, B = t.find(x => x.id === b)!;
  assert.deepEqual([A.title, A.note, A.hasTime, A.dueAt], ['A2', null, false, at('2026-10-21 00:00')]);
  assert.deepEqual([B.done, B.doneAt], [true, NOW]);
  await updateTasks(s, { updates: [{ id: b, done: false }, { id: a, due: null }] }, NOW);
  const t2 = await s.tasks(); assert.equal(t2.find(x => x.id === b)!.doneAt, null); assert.equal(t2.find(x => x.id === a)!.dueAt, null);
  const r = await updateTasks(s, { updates: [{ id: a, remove: true }] }, NOW); assert.deepEqual(r.removed, [a]);
  assert.equal((await s.tasks()).length, 1);
  await assert.rejects(updateTasks(s, { updates: [{ id: b, bogus: 1 }] }, NOW), /onbekend veld/);
});
test('done tasks show for a day as recentlyDone and are pruned after three days', async () => {
  const s = fresh(); const { added } = await addTasks(s, { tasks: [{ title: 'A', category: 'thuis' }, { title: 'B', category: 'thuis' }] }, NOW);
  await updateTasks(s, { updates: [{ id: added[0].id, done: true }] }, NOW);
  const d = await dashboard(s, NOW + 3600_000);
  assert.deepEqual(d.recentlyDone.map(x => x.title), ['A']); assert.equal(d.tasks.length, 1);
  assert.equal((await dashboard(s, NOW + 25 * 3600_000)).recentlyDone.length, 0);
  await updateTasks(s, { updates: [{ id: added[1].id, title: 'B2' }] }, NOW + 4 * 24 * 3600_000);
  assert.deepEqual((await s.tasks()).map(t => t.title), ['B2'], 'A (done 4 days ago) is gone');
});
test('reorder_tasks puts these first, in order; unknown or duplicate ids are refused', async () => {
  const s = fresh(); const { added } = await addTasks(s, { tasks: ['A', 'B', 'C', 'D'].map(title => ({ title, category: 'thuis' })) }, NOW);
  const [a, b, c, d] = added.map(x => x.id);
  await reorderTasks(s, { ids: [d, b] });
  assert.deepEqual((await dashboard(s, NOW)).tasks.map(t => t.title), ['D', 'B', 'A', 'C']);
  await assert.rejects(reorderTasks(s, { ids: [a, 'nope'] }), /geen open taak/); await assert.rejects(reorderTasks(s, { ids: [a, a] }), /dubbele/);
  void c;
});
test('leftOpen lists open tasks from an earlier day, without a verdict', async () => {
  const s = fresh(); await addTasks(s, { tasks: [{ title: 'Oud', category: 'thuis', due: '2026-10-15 19:00' }, { title: 'Nu', category: 'thuis', due: '2026-10-16 09:00' }, { title: 'Zonder', category: 'thuis' }] }, NOW);
  const d = await dashboard(s, NOW); assert.deepEqual(d.leftOpen, [d.tasks.find(t => t.title === 'Oud')!.id]);
});
test('appointment: needs a time, end after start, clears, and disappears when over', async () => {
  const s = fresh();
  await setAppointment(s, { title: 'Standup 10:00', start: '2026-10-16 11:00', end: '2026-10-16 11:30' }, NOW);
  assert.equal((await dashboard(s, NOW)).appointment!.title, 'Standup 10:00');
  assert.equal((await dashboard(s, at('2026-10-16 11:31'))).appointment, null);
  await assert.rejects(setAppointment(s, { title: 'x', start: '2026-10-16' }, NOW), /tijd/);
  await assert.rejects(setAppointment(s, { title: 'x', start: '11:00', end: '10:00' }, NOW), /na start/);
  await setAppointment(s, { clear: true }, NOW); assert.equal((await s.appointment()), null);
});

// ---- MCP over HTTP
const TOKEN = 'mcp-token-0123456789abcdef', READ = 'read-token-0123456789abcdef';
const mcp = (store: Store | null, body: unknown, o: { auth?: string | null; path?: string; method?: string; allowPath?: boolean } = {}) => handleMcp(new Request('https://x.test' + (o.path ?? '/api/mcp'), { method: o.method ?? 'POST', headers: { 'content-type': 'application/json', ...(o.auth === null ? {} : { authorization: `Bearer ${o.auth ?? TOKEN}` }) }, body: o.method === 'GET' ? undefined : JSON.stringify(body) }), { store, token: TOKEN, now: () => NOW, allowPathToken: o.allowPath });
const call = (id: number, name: string, args: unknown = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const text = async (r: Response) => JSON.parse(((await r.json()) as any).result.content[0].text);

test('mcp: refuses without or with a wrong token, answers 503 when not configured', async () => {
  const s = fresh();
  assert.equal((await mcp(s, {}, { auth: null })).status, 401);
  assert.equal((await mcp(s, {}, { auth: 'wrong-token-0123456789abcdef' })).status, 401);
  assert.equal((await mcp(s, {}, { auth: READ })).status, 401);
  assert.equal((await mcp(null, { jsonrpc: '2.0', id: 1, method: 'ping' })).status, 503);
  const r = await handleMcp(new Request('https://x.test/api/mcp', { method: 'POST', headers: { authorization: 'Bearer anything-long-enough' }, body: '{}' }), { store: s, token: undefined, now: () => NOW });
  assert.equal(r.status, 503, 'no token configured must never mean open');
  assert.equal((await mcp(s, {}, { method: 'GET' })).status, 405);
});
test('mcp: the path token only works where it is allowed', async () => {
  const s = fresh(), ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
  assert.equal((await mcp(s, ping, { auth: null, path: `/api/mcp/${TOKEN}`, allowPath: true })).status, 200);
  assert.equal((await mcp(s, ping, { auth: null, path: `/api/mcp/${TOKEN}` })).status, 401);
  assert.equal((await mcp(s, ping, { auth: null, path: '/api/mcp/short', allowPath: true })).status, 401);
});
test('mcp: initialize, list, a braindump through add_tasks and the dashboard back', async () => {
  const s = fresh();
  const init = await (await mcp(s, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })).json() as any;
  assert.equal(init.result.protocolVersion, '2025-03-26'); assert.match(init.result.instructions, /Braindump/);
  assert.equal(((await (await mcp(s, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } })).json()) as any).result.protocolVersion, '2025-06-18');
  const list = await (await mcp(s, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json() as any;
  assert.deepEqual(list.result.tools.map((t: any) => t.name), ['dashboard', 'add_tasks', 'update_tasks', 'reorder_tasks', 'appointment']);
  for (const t of list.result.tools) assert.equal(t.inputSchema.type, 'object');
  const added = await text(await mcp(s, call(3, 'add_tasks', { tasks: [{ title: 'Naar oma', category: 'prive', due: '2026-10-17 18:00', note: 'Fiets meenemen' }] })));
  assert.equal(added.added.length, 1);
  const dash = await text(await mcp(s, call(4, 'dashboard')));
  assert.equal(dash.v, 2); assert.equal(dash.tasks[0].title, 'Naar oma'); assert.equal(dash.tasks[0].state, 'later'); assert.equal(dash.tasks[0].hasTime, true);
});
test('mcp: input mistakes come back as text for Claude, our own errors stay generic', async () => {
  const s = fresh();
  const bad = await (await mcp(s, call(1, 'add_tasks', { tasks: [{ title: 'Bellen om 18:00', category: 'werk' }] }))).json() as any;
  assert.equal(bad.result.isError, true); assert.match(bad.result.content[0].text, /^Ongeldig: item 1: .*due/);
  const down = async () => { throw new Error('redis password=hunter2 down'); };
  const broken: Store = { tasks: down, putTasks: down, deleteTasks: down, appointment: down, setAppointment: down };
  const r = await (await mcp(broken, call(2, 'dashboard'))).json() as any;
  assert.equal(r.result.isError, true); assert.ok(!JSON.stringify(r).includes('hunter2'));
});
test('mcp: protocol edges: unknown tool/method, prototype names, notifications, batches, bad JSON, size', async () => {
  const s = fresh();
  assert.equal(((await (await mcp(s, call(1, 'nope'))).json()) as any).error.code, -32602);
  assert.equal(((await (await mcp(s, call(1, 'constructor'))).json()) as any).error.code, -32602);
  assert.equal(((await (await mcp(s, call(1, '__proto__'))).json()) as any).error.code, -32602);
  assert.equal(((await (await mcp(s, { jsonrpc: '2.0', id: 1, method: 'x/y' })).json()) as any).error.code, -32601);
  assert.equal((await mcp(s, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const batch = await (await mcp(s, [{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'ping' }])).json() as any[];
  assert.deepEqual(batch.map(x => x.id), [1, 2]);
  assert.equal((await mcp(s, [])).status, 400);
  assert.equal(((await (await mcp(s, 'nonsense')).json()) as any).error.code, -32600);
  const raw = await handleMcp(new Request('https://x.test/api/mcp', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: '{oops' }), { store: s, token: TOKEN, now: () => NOW });
  assert.equal(raw.status, 400);
  const big = await handleMcp(new Request('https://x.test/api/mcp', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: 'x'.repeat(70_000) }), { store: s, token: TOKEN, now: () => NOW });
  assert.equal(big.status, 413);
});

// ---- state endpoint (read-only)
const state = (store: Store | null, o: { auth?: string | null; method?: string } = {}) => handleState(new Request('https://x.test/api/state', { method: o.method ?? 'GET', headers: o.auth === null ? {} : { authorization: `Bearer ${o.auth ?? READ}` } }), { store, token: READ, now: () => NOW });
test('state: the read token reads, cannot write, and the write token is not accepted here', async () => {
  const s = fresh(); await addTasks(s, { tasks: [{ title: 'A', category: 'thuis' }] }, NOW);
  const ok = await state(s); assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal(((await ok.json()) as any).tasks[0].title, 'A');
  assert.equal((await state(s, { auth: null })).status, 401); assert.equal((await state(s, { auth: TOKEN })).status, 401);
  assert.equal((await state(null)).status, 503); assert.equal((await state(s, { method: 'POST' })).status, 405);
  assert.equal((await state(s, { method: 'OPTIONS' })).status, 204);
  assert.equal((await mcp(s, call(1, 'dashboard'), { auth: READ })).status, 401, 'the screen token cannot use the MCP');
});

// ---- Upstash over REST, with a fake
function fakeRedis() {
  const h = new Map<string, Map<string, string>>(), kv = new Map<string, string>(); const calls: unknown[][] = [];
  const f = (async (_u: string, init: RequestInit) => {
    const cmds = JSON.parse(init.body as string) as string[][]; calls.push(...cmds);
    if (new Headers(init.headers).get('authorization') !== 'Bearer tok') return new Response('{}', { status: 401 });
    const out = cmds.map(([c, k, ...a]) => {
      if (c === 'HSET') { const m = h.get(k) ?? new Map(); for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]); h.set(k, m); return { result: a.length / 2 }; }
      if (c === 'HGETALL') return { result: [...(h.get(k) ?? new Map()).entries()].flat() };
      if (c === 'HDEL') { const m = h.get(k); a.forEach(x => m?.delete(x)); return { result: a.length }; }
      if (c === 'GET') return { result: kv.get(k) ?? null }; if (c === 'SET') { kv.set(k, a[0]); return { result: 'OK' }; } if (c === 'DEL') { kv.delete(k); return { result: 1 }; }
      return { error: 'ERR unknown ' + c };
    });
    return new Response(JSON.stringify(out), { status: 200 });
  }) as typeof fetch;
  return { f, h, calls };
}
test('upstash store: round trip, one hash field per task, bad record skipped, errors surface', async () => {
  const r = fakeRedis(), s = new UpstashStore({ url: 'https://r.test', token: 'tok', fetch: r.f });
  await addTasks(s, { tasks: [{ title: 'A', category: 'thuis', due: '2026-10-17 09:00' }, { title: 'B', category: 'werk' }] }, NOW);
  assert.equal(r.h.get('dashy:v2:tasks')!.size, 2);
  r.h.get('dashy:v2:tasks')!.set('junk', '{"id":1}'); r.h.get('dashy:v2:tasks')!.set('junk2', 'not json');
  assert.deepEqual((await s.tasks()).map(t => t.title).sort(), ['A', 'B']);
  await setAppointment(s, { title: 'X', start: '2026-10-16 12:00' }, NOW); assert.equal((await s.appointment())!.title, 'X');
  await setAppointment(s, { clear: true }, NOW); assert.equal(await s.appointment(), null);
  await assert.rejects(new UpstashStore({ url: 'https://r.test', token: 'bad', fetch: r.f }).tasks(), /status 401/);
  await assert.rejects(new UpstashStore({ url: 'https://r.test', token: 'tok', fetch: (async () => new Response(JSON.stringify([{ error: 'WRONGTYPE' }]))) as typeof fetch }).tasks(), /WRONGTYPE/);
  const [t] = await s.tasks(); assert.deepEqual(parseTask(JSON.stringify(t)), t); assert.equal(parseTask('{"id":"a"}'), null);
});

// ---- the screen can read what the server writes
test('client: the v2 body parses, labels the time and feeds the driver', async () => {
  const s = fresh(); await addTasks(s, { tasks: [{ title: 'Eerst', category: 'thuis', due: '2026-10-16 19:00' }, { title: 'Dag', category: 'prive', due: '2026-10-17' }, { title: 'Oud', category: 'thuis', due: '2026-10-15 19:00' }] }, NOW);
  const snap = parseDashboard(JSON.stringify(await dashboard(s, NOW)));
  const by = (t: string) => snap.tasks.find(x => x.title === t)!;
  assert.equal(by('Eerst').when, 'vandaag 19:00'); assert.equal(by('Eerst').due, at('2026-10-16 19:00'));
  assert.equal(by('Dag').when, 'morgen'); assert.equal(by('Dag').due, null, 'a day without a time is not a deadline');
  assert.equal(snap.leftOpen.length, 1);
  assert.deepEqual(snapshotEvents(null, snap).map(e => e.type), ['taskAdded', 'taskAdded', 'taskAdded', 'waiting']);
  assert.throws(() => parseDashboard({ v: 2, today: 'x', now: 1, tasks: [] }));
  assert.throws(() => parseDashboard({ v: 2, today: '2026-10-16', now: 1, tasks: [{ id: 'a b', title: 't', category: 'c' }] }));
});
test('client: whenLabel across the week and the year', () => {
  assert.equal(whenLabel(at('2026-10-18 10:00'), true, NOW), 'zo 10:00'); assert.equal(whenLabel(at('2026-10-31 00:00'), false, NOW), '31 okt');
  assert.equal(whenLabel(at('2026-10-16 08:00'), true, NOW), 'vandaag 08:00');
});
void buildState;

// ---- the screen's one write: done / undo
import { handleAction } from '../src/server/mcp';
import { actionUrlOf, adoptTasksHash, loadTasksConnection } from '../src/tasks-connection';
const ACT = 'action-token-0123456789abcdef';
const act = (store: Store | null, body: unknown, o: { auth?: string | null; method?: string; raw?: string } = {}) => handleAction(new Request('https://x.test/api/action', { method: o.method ?? 'POST', headers: { 'content-type': 'application/json', ...(o.auth === null ? {} : { authorization: `Bearer ${o.auth ?? ACT}` }) }, body: o.method === 'GET' || o.method === 'OPTIONS' ? undefined : (o.raw ?? JSON.stringify(body)) }), { store, token: ACT, now: () => NOW });
test('action: done and undo with its own token, idempotent, answers with the fresh state', async () => {
  const s = fresh(); const { added } = await addTasks(s, { tasks: [{ title: 'A', category: 'thuis' }, { title: 'B', category: 'thuis' }] }, NOW);
  const [a] = added.map(x => x.id);
  const r = await act(s, { action: 'done', id: a }); assert.equal(r.status, 200);
  const st = await r.json() as any; assert.deepEqual(st.tasks.map((t: any) => t.title), ['B']); assert.deepEqual(st.recentlyDone.map((t: any) => t.title), ['A']);
  const again = await act(s, { action: 'done', id: a }); assert.equal(again.status, 200);
  assert.equal((await s.tasks()).find(t => t.id === a)!.doneAt, NOW, 'a second tap does not move doneAt');
  const back = await (await act(s, { action: 'undo', id: a })).json() as any; assert.deepEqual(back.tasks.map((t: any) => t.title).sort(), ['A', 'B']);
  assert.equal((await s.tasks()).find(t => t.id === a)!.position, 1, 'it comes back at its old place');
});
test('action: only its own token; the read and write tokens do nothing here, and the action token does nothing elsewhere', async () => {
  const s = fresh(); const { added } = await addTasks(s, { tasks: [{ title: 'A', category: 'thuis' }] }, NOW);
  const body = { action: 'done', id: added[0].id };
  for (const auth of [null, READ, TOKEN, 'x'.repeat(20)]) assert.equal((await act(s, body, { auth })).status, 401, String(auth));
  assert.equal((await s.tasks())[0].done, false);
  assert.equal((await state(s, { auth: ACT })).status, 401); assert.equal((await mcp(s, call(1, 'dashboard'), { auth: ACT })).status, 401);
  const noToken = await handleAction(new Request('https://x.test/api/action', { method: 'POST', headers: { authorization: `Bearer ${ACT}` }, body: JSON.stringify(body) }), { store: s, token: undefined, now: () => NOW }); assert.equal(noToken.status, 503);
});
test('action: it can do nothing but done/undo, and rejects bad input', async () => {
  const s = fresh(); await addTasks(s, { tasks: [{ title: 'A', category: 'thuis' }] }, NOW);
  assert.equal((await act(s, { action: 'done', id: 'nonexist' })).status, 404);
  for (const bad of [{ action: 'remove', id: 'abcdefgh' }, { action: 'done' }, { action: 'done', id: 5 }, { action: 'done', id: '../x' }, { id: 'a' }, []]) assert.equal((await act(s, bad)).status, 400, JSON.stringify(bad));
  assert.equal((await act(s, null, { raw: '{oops' })).status, 400); assert.equal((await act(s, null, { raw: 'x'.repeat(2000) })).status, 413);
  assert.equal((await act(s, {}, { method: 'GET' })).status, 405); assert.equal((await act(null, { action: 'done', id: 'abcdefgh' })).status, 503);
  const pre = await act(s, {}, { method: 'OPTIONS' }); assert.equal(pre.status, 204); assert.match(pre.headers.get('access-control-allow-headers')!, /content-type/);
  assert.equal((await s.tasks()).length, 1);
});
test('connection: act token adopted, action url derived from the state url, no action without a token', () => {
  const m = new Map<string, string>(); const st = { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
  adoptTasksHash('#tasks=' + encodeURIComponent('https://x.test/api/state') + '&key=abcdefghij12&act=zyxwvutsrq99', st);
  assert.deepEqual(loadTasksConnection(st), { url: 'https://x.test/api/state', token: 'abcdefghij12', actionToken: 'zyxwvutsrq99', actionUrl: 'https://x.test/api/action' });
  m.clear(); adoptTasksHash('#tasks=' + encodeURIComponent('https://x.test/api/state') + '&key=abcdefghij12', st);
  assert.equal(loadTasksConnection(st)!.actionUrl, null);
  assert.equal(actionUrlOf('https://x.test/api/state?x=1'), 'https://x.test/api/action'); assert.equal(actionUrlOf('https://x.test/dash.json'), null); assert.equal(actionUrlOf('nonsense'), null);
});
