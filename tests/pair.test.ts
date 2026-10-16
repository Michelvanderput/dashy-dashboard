import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentPairing, handlePair, normalizeCode, pairCode, validPairCode, PAIR_WINDOW_MS } from '../src/server/pair';
import { handleMcp } from '../src/server/mcp';
import { MemoryStore } from '../src/server/store';
import { loadTasksConnection, pairWithCode } from '../src/tasks-connection';

const SECRET = 'mcp-secret-0123456789abcdef', STATE = 'state-key-0123456789abcdef', ACT = 'action-key-0123456789abcdef';
const NOW = 1_800_000_000_000;
const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) }; };
const pair = (body: unknown, o: { now?: number; method?: string; secret?: string | undefined; raw?: string } = {}) => handlePair(new Request('https://dash.test/api/pair', { method: o.method ?? 'POST', body: o.method === 'GET' ? undefined : (o.raw ?? JSON.stringify(body)) }), { secret: 'secret' in o ? o.secret : SECRET, stateToken: STATE, actionToken: ACT, now: () => o.now ?? NOW });

test('pairing code: eight readable characters, stable inside a window, different next window, different per secret', () => {
  const c = pairCode(SECRET, NOW);
  assert.match(c, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  assert.equal(pairCode(SECRET, NOW + 1000 < Math.ceil(NOW / PAIR_WINDOW_MS) * PAIR_WINDOW_MS ? NOW + 1000 : NOW), c);
  assert.notEqual(pairCode(SECRET, NOW + PAIR_WINDOW_MS), c); assert.notEqual(pairCode('other-secret-0123456789abc', NOW), c);
});
test('a code works for 10 to 20 minutes, typing it sloppily is fine, and then it is gone', () => {
  const c = pairCode(SECRET, NOW);
  assert.ok(validPairCode(SECRET, c, NOW)); assert.ok(validPairCode(SECRET, c.toLowerCase().replace('-', ' '), NOW)); assert.ok(validPairCode(SECRET, c, NOW + PAIR_WINDOW_MS));
  assert.ok(!validPairCode(SECRET, c, NOW + 2 * PAIR_WINDOW_MS)); assert.ok(!validPairCode(SECRET, '', NOW)); assert.ok(!validPairCode(SECRET, c.slice(0, 6), NOW));
  assert.equal(normalizeCode(' k7m2-9qxa '), 'K7M29QXA');
  const p = currentPairing(SECRET, NOW); assert.equal(p.code, c); assert.ok(p.minutesValid >= 1 && p.minutesValid <= 10);
});
test('/api/pair hands out the screen keys for a good code, and only those', async () => {
  const res = await pair({ code: pairCode(SECRET, NOW) });
  assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { url: 'https://dash.test/api/state', key: STATE, act: ACT });
});
test('/api/pair refuses a wrong or old code, bad input, other methods, and a server without a secret', async () => {
  assert.equal((await pair({ code: 'AAAA-BBBB' })).status, 401);
  assert.equal((await pair({ code: pairCode(SECRET, NOW) }, { now: NOW + 3 * PAIR_WINDOW_MS })).status, 401);
  assert.equal((await pair({ code: 5 })).status, 401); assert.equal((await pair({}, { raw: 'nope' })).status, 400); assert.equal((await pair({}, { raw: 'x'.repeat(300) })).status, 413);
  assert.equal((await pair({}, { method: 'GET' })).status, 405); assert.equal((await pair({ code: pairCode(SECRET, NOW) }, { secret: undefined })).status, 503); assert.equal((await pair({ code: 'x' }, { secret: 'short' })).status, 503);
  assert.equal((await pair({}, { method: 'OPTIONS' })).status, 204);
});
test('the MCP tool pairing_code gives the code for the current time and nothing else', async () => {
  const call = (tok: string) => handleMcp(new Request('https://dash.test/api/mcp', { method: 'POST', headers: { authorization: `Bearer ${tok}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pairing_code', arguments: {} } }) }), { store: new MemoryStore(), token: SECRET, now: () => NOW });
  const out = JSON.parse(((await (await call(SECRET)).json()) as { result: { content: { text: string }[] } }).result.content[0].text);
  assert.equal(out.code, pairCode(SECRET, NOW)); assert.ok(!JSON.stringify(out).includes(STATE));
  assert.equal((await call('wrong-token-0123456789abcdef')).status, 401);
});
test('pairWithCode: the keys are remembered; wrong code, offline and a broken answer store nothing', async () => {
  const ok = mem();
  const f = (async (url: string, init: RequestInit) => pair(JSON.parse(String(init.body)))) as unknown as typeof fetch;
  assert.equal(await pairWithCode(pairCode(SECRET, NOW), 'https://dash.test/', ok, f), 'ok');
  const c = loadTasksConnection(ok)!; assert.equal(c.url, 'https://dash.test/api/state'); assert.equal(c.token, STATE); assert.equal(c.actionToken, ACT); assert.equal(c.actionUrl, 'https://dash.test/api/action');
  const bad = mem();
  assert.equal(await pairWithCode('AAAA-BBBB', 'https://dash.test/', bad, f), 'wrong');
  assert.equal(await pairWithCode('x', 'https://dash.test/', bad, (async () => { throw new Error('offline'); }) as unknown as typeof fetch), 'offline');
  assert.equal(await pairWithCode('x', 'https://dash.test/', bad, (async () => new Response('{"url":"javascript:1","key":"k"}')) as unknown as typeof fetch), 'unavailable');
  assert.equal(await pairWithCode('x', 'https://dash.test/', bad, (async () => new Response('', { status: 503 })) as unknown as typeof fetch), 'unavailable');
  assert.equal(loadTasksConnection(bad), null);
});
