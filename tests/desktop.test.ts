import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ORIGINS, originsFrom, preflight, withCors } from '../src/server/cors';
import { MemoryStore, apply, emptyDoc } from '../src/server/dashyStore';
import { handleActionRequest } from '../src/server/actionHttp';
import { handleStateRequest } from '../src/server/stateHttp';
import { adoptHash, loadConnection } from '../src/connection';

const T0 = Date.parse('2026-10-16T12:00:00+02:00'), TAURI = 'tauri://localhost';
const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) }; };
const mk = () => { const store = new MemoryStore(); const o = apply(emptyDoc(T0), { tool: 'task', action: 'added', id: 'a', title: 'A', due: null }, T0); if (o.ok) store.doc = o.doc; return store; };
const common = { now: () => T0 + 1000, allow: async () => true, log: () => {}, allowedOrigins: DEFAULT_ORIGINS };

test('origins: the desktop shells by default, extra ones only as plain origins', () => {
  assert.deepEqual(originsFrom(undefined), [...DEFAULT_ORIGINS]);
  const o = originsFrom('https://dashy.example, javascript:alert(1), https://x.com/path, http://localhost:5173, *');
  assert.ok(o.includes('https://dashy.example') && o.includes('http://localhost:5173'));
  assert.ok(!o.some(x => /javascript|path|\*/.test(x)));
});

test('preflight: allowed origin gets 204 with the right headers; others get 403 and no headers', () => {
  const ok = preflight(new Request('http://x', { method: 'OPTIONS', headers: { origin: TAURI } }), DEFAULT_ORIGINS, 'POST');
  assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), TAURI);
  assert.match(ok.headers.get('access-control-allow-headers')!, /authorization/); assert.equal(ok.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  for (const origin of ['https://evil.example', null]) {
    const r = preflight(new Request('http://x', { method: 'OPTIONS', headers: origin ? { origin } : {} }), DEFAULT_ORIGINS, 'POST');
    assert.equal(r.status, 403); assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(withCors(new Request('http://x', { headers: { origin: 'https://evil.example' } }), DEFAULT_ORIGINS, new Response('x')).headers.get('access-control-allow-origin'), null);
});

test('state and action endpoints answer a desktop shell (also errors), never a foreign origin; the token is still required', async () => {
  const store = mk();
  const stateDeps = { ...common, store, stateToken: 'state-secret-1' }, actionDeps = { ...common, store, actionToken: 'action-secret-1' };
  let r = await handleStateRequest(new Request('http://x', { method: 'OPTIONS', headers: { origin: TAURI } }), stateDeps); assert.equal(r.status, 204);
  r = await handleStateRequest(new Request('http://x', { headers: { origin: TAURI, authorization: 'Bearer state-secret-1' } }), stateDeps);
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), TAURI);
  r = await handleStateRequest(new Request('http://x', { headers: { origin: TAURI, authorization: 'Bearer nope-nope-1' } }), stateDeps);
  assert.equal(r.status, 401); assert.equal(r.headers.get('access-control-allow-origin'), TAURI, 'the shell can read the error');
  r = await handleStateRequest(new Request('http://x', { headers: { origin: 'https://evil.example', authorization: 'Bearer state-secret-1' } }), stateDeps);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  r = await handleActionRequest(new Request('http://x', { method: 'OPTIONS', headers: { origin: TAURI } }), actionDeps); assert.equal(r.status, 204);
  r = await handleActionRequest(new Request('http://x', { method: 'POST', headers: { origin: TAURI, authorization: 'Bearer action-secret-1' }, body: JSON.stringify({ action: 'done', id: 'a' }) }), actionDeps);
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), TAURI);
  r = await handleActionRequest(new Request('http://x', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), { ...actionDeps, allowedOrigins: undefined }); assert.equal(r.status, 403);
  r = await handleStateRequest(new Request('http://x', { headers: { origin: TAURI, authorization: 'Bearer state-secret-1' } }), { ...stateDeps, allowedOrigins: undefined });
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'no allowed origins configured = same-origin only');
});

test('connection: a desktop shell stores the site it talks to; only https (or localhost) origins are accepted', () => {
  const s = mem();
  adoptHash('#key=abcdefgh1234&act=zyxwvuts9876&api=https://dashy.vercel.app', s);
  assert.deepEqual(loadConnection(s, 'tauri://localhost'), { stateUrl: 'https://dashy.vercel.app/api/dashy-state', actionUrl: 'https://dashy.vercel.app/api/dashy-action', token: 'abcdefgh1234', actionToken: 'zyxwvuts9876' });
  for (const api of ['http://evil.example', 'https://evil.example/path', 'javascript:alert(1)', 'https://a.example?x=1', '//evil.example']) {
    const t = mem(); adoptHash(`#key=abcdefgh1234&api=${encodeURIComponent(api)}`, t);
    assert.equal(loadConnection(t, 'https://own.site')!.stateUrl, 'https://own.site/api/dashy-state', api);
  }
  const l = mem(); adoptHash('#key=abcdefgh1234&api=http://localhost:3000', l); assert.equal(loadConnection(l, 'tauri://localhost')!.stateUrl, 'http://localhost:3000/api/dashy-state');
  const web = mem(); adoptHash('#key=abcdefgh1234', web); assert.equal(loadConnection(web, 'https://own.site')!.stateUrl, 'https://own.site/api/dashy-state');
  assert.equal(adoptHash('#key=abcdefgh1234&api=https://x.example&keep=1', mem()).cleaned, '#keep=1');
});

import { connectionHash } from '../src/connection';
test('connect form: builds the same hash the link would, and refuses anything unsafe', () => {
  assert.equal(connectionHash({ site: ' https://dashy.vercel.app/ ', key: 'abcdefgh1234', act: 'zyxwvuts9876' }), '#key=abcdefgh1234&act=zyxwvuts9876&api=https%3A%2F%2Fdashy.vercel.app');
  const s = mem(); adoptHash(connectionHash({ site: 'https://dashy.vercel.app', key: 'abcdefgh1234' })!, s);
  assert.equal(loadConnection(s, 'tauri://localhost')!.stateUrl, 'https://dashy.vercel.app/api/dashy-state');
  assert.equal(loadConnection(s, 'tauri://localhost')!.actionToken, null);
  for (const bad of [{ site: 'http://dashy.example', key: 'abcdefgh1234' }, { site: 'https://x.example/api', key: 'abcdefgh1234' }, { site: 'https://x.example', key: 'short' }, { site: 'https://x.example', key: 'abcdefgh1234', act: 'bad act' }, { site: '', key: '' }])
    assert.equal(connectionHash(bad), null, JSON.stringify(bad));
});
