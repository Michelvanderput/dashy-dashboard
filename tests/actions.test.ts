import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, apply, emptyDoc } from '../src/server/dashyStore';
import { handleActionRequest, type ActionHttpDeps } from '../src/server/actionHttp';
import { buildStateBody } from '../src/server/stateHttp';
import { CALM, parseRemoteState, sendAction } from '../src/state-client';
import { adoptHash, forgetConnection, loadConnection } from '../src/connection';

const T0 = Date.parse('2026-10-16T12:00:00+02:00'), TOKEN = 'action-secret-1';
const mk = (over: Partial<ActionHttpDeps> = {}) => {
  const store = new MemoryStore();
  const o = apply(emptyDoc(T0), { tool: 'task', action: 'added', id: 'a', title: 'Offerte sturen', due: null }, T0);
  if (o.ok) store.doc = o.doc;
  const logs: string[] = [];
  const deps: ActionHttpDeps = { store, now: () => T0 + 10_000, actionToken: TOKEN, allow: async () => true, log: m => { logs.push(m); }, ...over };
  const f = ((i: RequestInfo | URL, init?: RequestInit) => handleActionRequest(new Request(i as string, init), deps)) as typeof fetch;
  return { store, deps, f, logs };
};
const post = (body: unknown, token = TOKEN, method = 'POST') => new Request('http://x/api/dashy-action', { method, headers: { authorization: `Bearer ${token}` }, body: method === 'POST' ? JSON.stringify(body) : undefined });

test('done checks the task off and answers with the fresh state; undo brings it back', async () => {
  const { deps, store } = mk();
  let r = await handleActionRequest(post({ action: 'done', id: 'a' }), deps);
  assert.equal(r.status, 200);
  let b = parseRemoteState(await r.text());
  assert.equal(b.items[0].done, true); assert.equal(b.state, 'done');
  assert.equal(store.doc!.items.a.done, true);
  r = await handleActionRequest(post({ action: 'undo', id: 'a' }), deps);
  b = parseRemoteState(await r.text()); assert.equal(b.items[0].done, false);
});

test('every failure answers with the calm shape and the right status', async () => {
  const bad = async (req: Request, deps = mk().deps) => { const r = await handleActionRequest(req, deps); parseRemoteState(await r.text()); return r.status; };
  assert.equal(await bad(post({ action: 'done', id: 'a' }, 'wrong-token-1')), 401);
  assert.equal(await bad(post({}, TOKEN, 'GET')), 405);
  assert.equal(await bad(post({ action: 'delete', id: 'a' })), 400);
  assert.equal(await bad(post({ action: 'done' })), 400);
  assert.equal(await bad(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: '{nope' })), 400);
  assert.equal(await bad(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: 'x'.repeat(2000) })), 413);
  assert.equal(await bad(post({ action: 'done', id: 'a' }), mk({ actionToken: undefined }).deps), 503);
  assert.equal(await bad(post({ action: 'done', id: 'a' }), mk({ allow: async () => false }).deps), 429);
  assert.equal(await bad(post({ action: 'undo', id: 'a' })), 409, 'undo of an open task is refused');
  const broken = mk(); broken.store.save = async () => { throw new Error('redis sk-secret'); };
  const r = await handleActionRequest(post({ action: 'done', id: 'a' }), broken.deps);
  assert.equal(r.status, 503); assert.ok(!(await r.text()).includes('sk-secret')); assert.ok(broken.logs.some(l => l.includes('redis')));
});

test('the action token cannot read and the state token cannot act (different secrets, one purpose each)', async () => {
  const { deps } = mk();
  assert.equal((await handleActionRequest(post({ action: 'done', id: 'a' }, 'state-secret-1'), deps)).status, 401);
});

test('state client: items are parsed strictly; a bad item makes the whole body calm', async () => {
  const doc = apply(emptyDoc(T0), { tool: 'task', action: 'added', id: 'a', title: 'A', due: null }, T0);
  assert.ok(doc.ok);
  const body = buildStateBody(doc.doc, T0 + 5000);
  assert.equal(parseRemoteState(JSON.stringify(body)).items.length, 1);
  assert.deepEqual(parseRemoteState({ state: 'idle', line: '', source: 'driver', nextWakeAt: null }).items, [], 'old servers without items still work');
  for (const items of [[{ id: 'a b', kind: 'task', title: 'x', at: null }], [{ id: 'a', kind: 'x', title: 'x', at: null }], [{ id: 'a', kind: 'task', title: '', at: null }], [{ id: 'a', kind: 'task', title: 'x', at: 'nu' }], 'nope'])
    assert.throws(() => parseRemoteState({ ...body, items }));
  assert.throws(() => parseRemoteState({ ...body, focusId: 'a b' }));
  const r = await sendAction({ url: 'http://x', token: TOKEN, action: 'done', id: 'a', fetch: (async () => new Response('nope', { status: 500 })) as typeof fetch });
  assert.equal(r, null);
  assert.equal(CALM.items.length, 0);
});

const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) }; };
test('connection: the link remembers the tokens on this device and cleans the address bar; garbage is ignored', () => {
  const s = mem();
  assert.equal(loadConnection(s, 'https://app.example'), null);
  assert.deepEqual(adoptHash('#key=abcdefgh1234&act=zyxwvuts9876&x=1', s), { cleaned: '#x=1', adopted: true });
  assert.deepEqual(loadConnection(s, 'https://app.example'), { stateUrl: 'https://app.example/api/dashy-state', actionUrl: 'https://app.example/api/dashy-action', token: 'abcdefgh1234', actionToken: 'zyxwvuts9876' });
  assert.equal(adoptHash('#key=short', mem()).adopted, false);
  assert.equal(adoptHash('#key=<script>alert(1)</script>', mem()).adopted, false);
  const s2 = mem(); adoptHash('#key=abcdefgh1234', s2); assert.equal(loadConnection(s2, 'https://a')!.actionToken, null);
  s.set('dashy.connection', '{not json'); assert.equal(loadConnection(s, 'https://a'), null);
  adoptHash('#key=abcdefgh1234', s); forgetConnection(s); assert.equal(loadConnection(s, 'https://a'), null);
});
