import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAdviceRequest, type AdviceDeps } from '../src/server/adviceHandler';
import { fetchAdvice } from '../src/advice-client';
import { SAFE_FALLBACK } from '../src/advice';

const TOKEN = 's3cret';
const body = { now: '2026-10-16T14:05:00+02:00', tasks: [{ title: 'Offerte sturen' }], agenda: [] };
const good = { state: 'strict', line: 'Offerte eerst. Eén stap.' };
const make = (over: Partial<AdviceDeps> = {}): AdviceDeps => ({ token: TOKEN, allow: async () => true, generate: async () => good, ...over });
const post = (b: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }, method = 'POST') =>
  new Request('http://x/api/dashy-advice', { method, headers, body: method === 'GET' ? undefined : typeof b === 'string' ? b : JSON.stringify(b) });
const logs: string[] = []; const log = (m: string) => { logs.push(m); };
const SHAPE = (j: unknown) => { const o = j as Record<string, unknown>; return Object.keys(o).sort().join(',') === 'line,state' && typeof o.state === 'string' && typeof o.line === 'string'; };

test('happy path: 200 with exactly {state, line}', async () => {
  const r = await handleAdviceRequest(post(body), make(), log);
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), good);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('the model gets the system prompt and fenced data, and never the token', async () => {
  let seen: [string, string] = ['', ''];
  await handleAdviceRequest(post(body), make({ generate: async (s, u) => { seen = [s, u]; return good; } }), log);
  assert.match(seen[0], /Dashy/); assert.match(seen[1], /^<data>/); assert.ok(!seen[1].includes(TOKEN));
});

test('every failure still answers with the safe shape and the right status; details only go to the log', async () => {
  const cases: [string, Request, AdviceDeps, number, string][] = [
    ['wrong method', post(body, {}, 'GET'), make(), 405, 'method'],
    ['token not configured', post(body), make({ token: undefined }), 503, 'not-configured'],
    ['no token', post(body, {}), make(), 401, 'unauthorized'],
    ['wrong token', post(body, { authorization: 'Bearer nope' }), make(), 401, 'unauthorized'],
    ['empty token header equals empty config is still rejected', post(body, { authorization: 'Bearer ' }), make({ token: '' }), 503, 'not-configured'],
    ['not json', post('{{{'), make(), 400, 'bad-request'],
    ['wrong shape', post({ now: 1 }), make(), 400, 'bad-request'],
    ['array instead of object', post([1, 2]), make(), 400, 'bad-request'],
    ['too large', post({ ...body, tasks: [{ title: 'x'.repeat(30_000) }] }), make(), 413, 'too-large'],
    ['rate limited', post(body), make({ allow: async () => false }), 429, 'rate-limited'],
    ['rate limiter crashes', post(body), make({ allow: async () => { throw new Error('redis down'); } }), 429, 'rate-limited'],
  ];
  for (const [name, req, deps, status, reason] of cases) {
    const r = await handleAdviceRequest(req, deps, log);
    assert.equal(r.status, status, name); assert.equal(r.headers.get('x-dashy-reason'), reason, name);
    assert.deepEqual(await r.json(), SAFE_FALLBACK, name);
  }
});

test('model errors and invalid model output: 200 with the fallback, error text never leaks', async () => {
  for (const generate of [async () => { throw new Error('SECRET sk-ant-123 upstream exploded'); }, async () => ({ state: 'blocked', line: 'x' }), async () => 'nonsense'] as AdviceDeps['generate'][]) {
    logs.length = 0;
    const r = await handleAdviceRequest(post(body), make({ generate }), log);
    const text = await r.text();
    assert.equal(r.status, 200); assert.deepEqual(JSON.parse(text), SAFE_FALLBACK); assert.ok(!/SECRET|sk-ant|exploded/.test(text));
    assert.equal(r.headers.get('x-dashy-reason'), 'fallback');
  }
  logs.length = 0;
  await handleAdviceRequest(post(body), make({ generate: async () => { throw new Error('boom'); } }), log);
  assert.ok(logs.some(l => l.includes('boom')), 'logged server-side');
});

test('rate limit key comes from the caller address; the model is not called when limited', async () => {
  const keys: string[] = []; let calls = 0;
  const deps = make({ allow: async k => { keys.push(k); return false; }, generate: async () => { calls++; return good; } });
  await handleAdviceRequest(post(body, { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), deps, log);
  assert.deepEqual(keys, ['203.0.113.9']); assert.equal(calls, 0);
});

test('unauthorized requests never reach the rate limiter or the model', async () => {
  let touched = 0;
  const deps = make({ allow: async () => { touched++; return true; }, generate: async () => { touched++; return good; } });
  await handleAdviceRequest(post(body, {}), deps, log); await handleAdviceRequest(post('garbage', { authorization: `Bearer ${TOKEN}` }), deps, log);
  assert.equal(touched, 0);
});

// ---- app side ----
const url = 'http://x/api/dashy-advice';
const fakeFetch = (f: (req: Request) => Promise<Response>) => ((i: RequestInfo | URL, init?: RequestInit) => f(new Request(i as string, init))) as typeof fetch;

test('client: round trip through the real handler', async () => {
  const f = fakeFetch(req => handleAdviceRequest(req, make(), log));
  assert.deepEqual(await fetchAdvice(body, { url, token: TOKEN, fetch: f }), good);
});

test('client: network error, bad status, bad body, extra keys, disallowed state and timeout all give the fallback', async () => {
  const resp = (b: string, status = 200) => async () => new Response(b, { status });
  const fetches = [
    async () => { throw new TypeError('fetch failed'); }, resp('{"state":"idle","line":"x"}', 500), resp('<html>502</html>'), resp(''), resp('null'),
    resp('{"state":"idle","line":"x","debug":"sk-ant"}'), resp('{"state":"blocked","line":"x"}'), resp('{"state":"idle","line":""}'),
    () => new Promise<Response>(() => {}), // never answers
  ];
  for (const f of fetches) assert.deepEqual(await fetchAdvice(body, { url, token: TOKEN, timeoutMs: 50, fetch: fakeFetch(f as never) }), SAFE_FALLBACK);
});

test('client: the server fallback body is itself a valid {state, line} the app can parse (idle, empty line is allowed only as fallback)', async () => {
  const r = await handleAdviceRequest(post(body, {}), make(), log);
  assert.ok(SHAPE(await r.json()));
});

test('client sends a bearer token and only sanitized, capped data', async () => {
  let seen: Request | undefined; let text = '';
  const f = fakeFetch(async req => { seen = req; text = await req.clone().text(); return new Response(JSON.stringify(good)); });
  await fetchAdvice({ ...body, tasks: Array.from({ length: 100 }, () => ({ title: 'a\nb' + 'x'.repeat(500) })) }, { url, token: TOKEN, fetch: f });
  assert.equal(seen!.headers.get('authorization'), `Bearer ${TOKEN}`);
  const sent = JSON.parse(text); assert.equal(sent.tasks.length, 40); assert.ok(sent.tasks.every((t: { title: string }) => t.title.length <= 80 && !t.title.includes('\n')));
});
