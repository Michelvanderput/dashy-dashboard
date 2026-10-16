import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MemoryStore, emptyDoc, view } from '../src/server/dashyStore';
import { handleMcpRequest, type McpHttpDeps } from '../src/server/mcpHttp';
import { handleStateRequest } from '../src/server/stateHttp';
import { fetchDashyState } from '../src/state-client';

const MCP = 'mcp-secret', STATE = 'state-secret', URL_ = 'http://x/api/mcp';
let clock = Date.parse('2026-10-16T12:00:00+02:00');
const logs: string[] = [];
function setup(over: Partial<McpHttpDeps> = {}) {
  const store = new MemoryStore();
  const deps: McpHttpDeps = { store, now: () => clock, mcpToken: MCP, allow: async () => true, log: m => { logs.push(m); }, ...over };
  const fetchLike = ((i: RequestInfo | URL, init?: RequestInit) => handleMcpRequest(new Request(i as string, init), deps)) as typeof fetch;
  return { store, deps, fetchLike };
}
async function connect(fetchLike: typeof fetch, token = MCP, url = URL_) {
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { fetch: fetchLike, requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return client;
}
const call = async (c: Client, name: string, args: Record<string, unknown>) => {
  const r = await c.callTool({ name, arguments: args });
  return { isError: !!r.isError, body: JSON.parse(((r.content as { text: string }[])[0]).text) };
};

test('a real MCP client can connect, list the four tools, and call them', async () => {
  const { fetchLike, store } = setup();
  const c = await connect(fetchLike);
  const tools = await c.listTools();
  assert.deepEqual(tools.tools.map(t => t.name).sort(), ['dashy_activity', 'dashy_flag', 'dashy_mood', 'dashy_task']);
  for (const t of tools.tools) { assert.ok(t.description && t.description.length > 20, t.name); assert.equal(t.annotations?.destructiveHint, false); assert.equal(t.annotations?.openWorldHint, false); }
  const mood = tools.tools.find(t => t.name === 'dashy_mood')!;
  assert.deepEqual((mood.inputSchema.properties as any).state.enum, ['idle', 'working', 'thinking', 'waiting', 'happy', 'sad', 'angry', 'strict', 'dancing', 'sleepy']);

  let r = await call(c, 'dashy_task', { action: 'added', id: 'offerte', due: new Date(clock + 50 * 60_000).toISOString() });
  assert.deepEqual(r.body.shown.state, 'received');
  r = await call(c, 'dashy_mood', { state: 'happy', line: 'Goed bezig!' });
  assert.equal(r.body.ok, true);
  assert.equal(r.body.shown.source, 'driver', 'the received celebration beats the mood for a moment');
  clock += 5000;
  r = await call(c, 'dashy_flag', { flag: 'working', value: false });
  assert.equal(r.body.shown.state, 'strict', 'a deadline within the hour beats the mood');
  assert.match(r.body.shown.because, /deadlineSoon/);
  r = await call(c, 'dashy_task', { action: 'done', id: 'offerte' });
  assert.equal(r.body.shown.state, 'done');
  clock += 5000;
  r = await call(c, 'dashy_activity', {});
  assert.deepEqual([r.body.shown.state, r.body.shown.line, r.body.shown.source], ['happy', 'Goed bezig!', 'claude']);
  assert.equal(view((await store.load())!, clock).state, 'happy');
  await c.close();
});

test('tool errors come back as isError results Claude can read, with nothing saved', async () => {
  const { fetchLike, store } = setup();
  const c = await connect(fetchLike);
  for (const [name, args] of [['dashy_task', { action: 'due', id: 'unknown', due: null }], ['dashy_task', { action: 'added', id: 'a b' }], ['dashy_mood', { state: 'happy' }], ['dashy_task', { action: 'added', id: 'x', due: 'morgen' }]] as const) {
    const r = await call(c, name, args as Record<string, unknown>);
    assert.equal(r.isError, true, JSON.stringify(args)); assert.equal(r.body.ok, false); assert.ok(r.body.error.length > 5);
  }
  assert.equal(store.doc, null, 'nothing was written');
  // schema-level rejections (wrong state, wrong types) are protocol errors, also with nothing saved
  for (const args of [{ state: 'blocked', line: 'x' }, { state: 'happy', line: 'x'.repeat(101) }, { state: 'happy', line: 'x', minutes: 9999 }]) {
    const r = await c.callTool({ name: 'dashy_mood', arguments: args }).catch(e => ({ isError: true, thrown: String(e) }));
    assert.equal((r as { isError?: boolean }).isError, true, JSON.stringify(args));
  }
  assert.equal(store.doc, null);
  await c.close();
});

test('storage failure: Claude gets a calm error, the details only go to the log', async () => {
  const { fetchLike, store } = setup();
  store.save = async () => { throw new Error('redis exploded sk-secret'); };
  logs.length = 0;
  const c = await connect(fetchLike);
  const r = await call(c, 'dashy_activity', {});
  assert.equal(r.isError, true); assert.ok(!JSON.stringify(r).includes('sk-secret') && !JSON.stringify(r).includes('redis'));
  assert.ok(logs.some(l => l.includes('exploded')));
  await c.close();
});

test('auth, method, size, rate limit and configuration, in that order, all with JSON-RPC errors', async () => {
  const req = (init: RequestInit & { url?: string } = {}) => new Request(init.url ?? URL_, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(init.headers as object) }, body: init.body ?? '{"jsonrpc":"2.0","id":1,"method":"ping"}', ...(init.method ? { method: init.method } : {}) });
  const A = { authorization: `Bearer ${MCP}` };
  const code = async (r: Response) => (await r.json() as any).error?.code;
  const { deps } = setup();
  let r = await handleMcpRequest(new Request(URL_, { method: 'GET', headers: A }), deps); assert.equal(r.status, 405); assert.equal(r.headers.get('allow'), 'POST');
  r = await handleMcpRequest(req({ headers: {} }), deps); assert.equal(r.status, 401); assert.equal(r.headers.get('www-authenticate'), 'Bearer'); assert.equal(await code(r), -32001);
  r = await handleMcpRequest(req({ headers: { authorization: 'Bearer wrong' } }), deps); assert.equal(r.status, 401);
  r = await handleMcpRequest(req({ headers: { authorization: `Bearer ${STATE}` } }), deps); assert.equal(r.status, 401, 'the app token cannot use the MCP');
  r = await handleMcpRequest(req({ headers: {}, url: `${URL_}?key=${MCP}` }), deps); assert.equal(r.status, 200, '?key= works for connectors without header support');
  r = await handleMcpRequest(req({ headers: A, body: '{{' }), deps); assert.equal(r.status, 400);
  r = await handleMcpRequest(req({ headers: A, body: JSON.stringify({ x: 'y'.repeat(60_000) }) }), deps); assert.equal(r.status, 413);
  r = await handleMcpRequest(req({ headers: A }), setup({ allow: async () => false }).deps); assert.equal(r.status, 429);
  r = await handleMcpRequest(req({ headers: A }), setup({ allow: async () => { throw new Error('down'); } }).deps); assert.equal(r.status, 429, 'limiter failure fails closed');
  r = await handleMcpRequest(req({ headers: A }), setup({ mcpToken: undefined }).deps); assert.equal(r.status, 503);
  r = await handleMcpRequest(req({ headers: A }), setup({ store: null }).deps); assert.equal(r.status, 503);
  r = await handleMcpRequest(req({ headers: { authorization: 'Bearer ' } }), setup({ mcpToken: '' }).deps); assert.equal(r.status, 503, 'empty secret never matches');
});

test('unauthorized requests never touch storage or the rate limiter', async () => {
  let touched = 0;
  const { deps } = setup({ allow: async () => { touched++; return true; } });
  deps.store!.load = async () => { touched++; return null; };
  await handleMcpRequest(new Request(URL_, { method: 'POST', body: '{}' }), deps);
  assert.equal(touched, 0);
});

// ---- the app's read-only endpoint, and the client that polls it ----
test('state endpoint: the app sees what Claude and the driver decided, with a read-only token', async () => {
  const { store, fetchLike } = setup();
  const c = await connect(fetchLike);
  await call(c, 'dashy_mood', { state: 'dancing', line: 'Feest!' });
  const stateFetch = ((i: RequestInfo | URL, init?: RequestInit) => handleStateRequest(new Request(i as string, init), { store, now: () => clock, stateToken: STATE, allow: async () => true, log: m => { logs.push(m); } })) as typeof fetch;
  const s = await fetchDashyState({ url: 'http://x/api/dashy-state', token: STATE, fetch: stateFetch });
  assert.deepEqual([s.state, s.line, s.source], ['dancing', 'Feest!', 'claude']);
  assert.equal(s.nextWakeAt, clock + 30 * 60_000);
  assert.deepEqual(await fetchDashyState({ url: 'http://x/api/dashy-state', token: MCP, fetch: stateFetch }), { state: 'idle', line: '', source: 'fallback', nextWakeAt: null, rev: 0 }, 'the MCP token is not accepted here either');
  await c.close();
});

test('state endpoint failures all answer with a valid calm body and the right status', async () => {
  const store = new MemoryStore();
  const mk = (over: object = {}, method = 'GET', headers: Record<string, string> = { authorization: `Bearer ${STATE}` }) =>
    handleStateRequest(new Request('http://x/s', { method, headers }), { store, now: () => clock, stateToken: STATE, allow: async () => true, log: () => {}, ...over });
  for (const [r, status, reason] of [
    [await mk({}, 'POST'), 405, 'method'], [await mk({ stateToken: undefined }), 503, 'not-configured'], [await mk({ store: null }), 503, 'not-configured'],
    [await mk({}, 'GET', {}), 401, 'unauthorized'], [await mk({ allow: async () => false }), 429, 'rate-limited'], [await mk({ allow: async () => { throw new Error('x'); } }), 429, 'rate-limited'],
  ] as [Response, number, string][]) {
    assert.equal(r.status, status); assert.equal(r.headers.get('x-dashy-reason'), reason);
    const b = await r.json() as any; assert.deepEqual([b.state, b.line, b.source], ['idle', '', 'fallback']);
  }
  store.load = async () => { throw new Error('redis down'); };
  const r = await mk(); assert.equal(r.status, 200); assert.equal((await r.json() as any).source, 'fallback');
});

test('client never throws or hangs: bad status, bad body, wrong values, network error, no answer', async () => {
  const calm = { state: 'idle', line: '', source: 'fallback', nextWakeAt: null, rev: 0 };
  const resp = (b: string, status = 200) => async () => new Response(b, { status });
  const good = { state: 'happy', line: 'x', source: 'claude', nextWakeAt: null, rev: 3 };
  for (const f of [async () => { throw new TypeError('x'); }, resp(JSON.stringify(good), 500), resp('<html>'), resp('null'), resp(JSON.stringify({ ...good, state: 'banana' })),
    resp(JSON.stringify({ ...good, line: 'x'.repeat(101) })), resp(JSON.stringify({ ...good, source: 'hacked' })), resp(JSON.stringify({ ...good, nextWakeAt: 'soon' })), () => new Promise<Response>(() => {})])
    assert.deepEqual(await fetchDashyState({ url: 'http://x', token: 't', timeoutMs: 50, fetch: f as never }), calm);
  assert.deepEqual(await fetchDashyState({ url: 'http://x', token: 't', fetch: resp(JSON.stringify({ ...good, extra: 'ignored' })) as never }), good);
});

test('emptyDoc is exported for tests only: a calm start', () => assert.equal(view(emptyDoc(clock), clock).state, 'idle'));
