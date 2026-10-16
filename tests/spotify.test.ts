import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POLL, musicState, nextPollDelay, parseCurrentlyPlaying, pickCover, progressAt, vinylColor, VINYL_COLORS } from '../src/spotify/model';
import { AuthError, CONTROL_SCOPE, hasScope, beginLogin, buildAuthorizeUrl, challengeFor, checkRedirectUri, completeLogin, loadTokens, randomString, refreshTokens, saveTokens, type KeyValueStore } from '../src/spotify/auth';
import { fetchCurrentlyPlaying, sendCommand } from '../src/spotify/client';
import { MESSAGES, createSpotifySession } from '../src/spotify/session';
import { RULES } from '../src/driver';

const T0 = 1_000_000;
const track = (o: Record<string, unknown> = {}) => ({
  is_playing: true, progress_ms: 30_000, currently_playing_type: 'track',
  item: { id: 'abc', type: 'track', name: 'Die With A Smile', duration_ms: 251_000, artists: [{ name: 'Lady Gaga' }, { name: 'Bruno Mars' }],
    album: { name: 'Die With A Smile', images: [{ url: 'https://i.scdn.co/image/640', width: 640 }, { url: 'https://i.scdn.co/image/300', width: 300 }, { url: 'https://i.scdn.co/image/64', width: 64 }] },
    external_urls: { spotify: 'https://open.spotify.com/track/abc' } }, ...o,
});
const store = (): KeyValueStore & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: k => void m.delete(k) }; };
const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...headers } });

// ---------- model ----------
test('parse: a playing track', () => {
  const np = parseCurrentlyPlaying(track(), T0)!;
  assert.deepEqual([np.title, np.artists, np.album, np.playing, np.durationMs, np.progressMs, np.fetchedAt], ['Die With A Smile', ['Lady Gaga', 'Bruno Mars'], 'Die With A Smile', true, 251_000, 30_000, T0]);
  assert.equal(np.coverUrl, 'https://i.scdn.co/image/300', 'smallest cover that is at least 300 px');
  assert.equal(np.trackUrl, 'https://open.spotify.com/track/abc');
  assert.equal(parseCurrentlyPlaying(track({ is_playing: false }), T0)!.playing, false);
});
test('parse: nothing to show for ads, podcasts, empty and broken answers, and it never throws', () => {
  const bad: unknown[] = [null, undefined, 'x', 7, [], {}, track({ currently_playing_type: 'ad' }), track({ currently_playing_type: 'episode' }), track({ currently_playing_type: 'unknown' }),
    track({ item: null }), track({ item: { type: 'episode', name: 'Pod', duration_ms: 1000 } }), track({ item: { name: '', duration_ms: 1000 } }),
    track({ item: { name: 'x', duration_ms: 0 } }), track({ item: { name: 'x', duration_ms: 'long' } }), track({ item: { name: 'x', duration_ms: NaN } }),
    { is_playing: true, item: { name: 'x', duration_ms: 1000 } }];
  for (const b of bad) assert.equal(parseCurrentlyPlaying(b, T0), null, JSON.stringify(b));
});
test('parse: odd but valid answers are cleaned up (null progress, missing album, huge text, control characters, hostile links)', () => {
  const np = parseCurrentlyPlaying(track({ progress_ms: null, item: { name: 'A\n\tB', duration_ms: 1000, artists: [{ name: 'x'.repeat(500) }, null, {}], album: null, external_urls: { spotify: 'javascript:alert(1)' } } }), T0)!;
  assert.deepEqual([np.progressMs, np.title, np.album, np.coverUrl, np.trackUrl], [0, 'A B', '', null, null]);
  assert.equal(np.artists.length, 1); assert.equal(np.artists[0].length, 80);
  assert.equal(parseCurrentlyPlaying(track({ progress_ms: 999_999 }), T0)!.progressMs, 251_000, 'progress is clamped to the duration');
  assert.equal(parseCurrentlyPlaying(track({ item: { name: 'x', duration_ms: 10, album: { images: [] }, external_urls: { spotify: 'https://evil.example/x' } } }), T0)!.trackUrl, null, 'only spotify.com links');
});
test('cover: https only, smallest >= 300 else the largest', () => {
  assert.equal(pickCover([{ url: 'http://x/a.jpg', width: 640 }, { url: 'data:image/png;base64,AA', width: 640 }, { url: 'javascript:1' }]), null);
  assert.equal(pickCover([{ url: 'https://a/64', width: 64 }, { url: 'https://a/200', width: 200 }]), 'https://a/200');
  assert.equal(pickCover([{ url: 'https://a/640', width: 640 }, { url: 'https://a/320', width: 320 }]), 'https://a/320');
  assert.equal(pickCover([{ url: 'https://a/nowidth' }]), 'https://a/nowidth');
  assert.equal(pickCover('nope'), null); assert.equal(pickCover(undefined), null);
});
test('progress moves only while playing and never past the end', () => {
  const np = parseCurrentlyPlaying(track(), T0)!;
  assert.equal(progressAt(np, T0 + 10_000), 40_000);
  assert.equal(progressAt(np, T0 + 1e9), 251_000);
  assert.equal(progressAt({ ...np, playing: false }, T0 + 10_000), 30_000);
  assert.equal(progressAt(np, T0 - 5000), 25_000 < 0 ? 0 : 25_000, 'a clock going backwards cannot go below 0');
});
test('poll pace: 5 s while playing, sooner at the end of a track, 10 s idle, Retry-After respected, errors back off', () => {
  const np = parseCurrentlyPlaying(track(), T0)!;
  assert.equal(nextPollDelay({ kind: 'playing', np }, T0), POLL.playingMs);
  assert.equal(nextPollDelay({ kind: 'playing', np: { ...np, progressMs: 250_000 } }, T0), 1400);
  assert.equal(nextPollDelay({ kind: 'playing', np: { ...np, progressMs: 250_990 } }, T0), POLL.minMs, 'never faster than 1 s');
  assert.equal(nextPollDelay({ kind: 'playing', np: { ...np, playing: false } }, T0), POLL.idleMs);
  assert.equal(nextPollDelay({ kind: 'nothing' }, T0), POLL.idleMs);
  assert.equal(nextPollDelay({ kind: 'rate-limited', retryAfterMs: 30_000 }, T0), 30_000);
  assert.equal(nextPollDelay({ kind: 'rate-limited', retryAfterMs: 9e9 }, T0), POLL.maxRetryAfterMs);
  assert.equal(nextPollDelay({ kind: 'rate-limited', retryAfterMs: 0 }, T0), POLL.minMs);
  assert.deepEqual([0, 1, 2, 3, 9].map(n => nextPollDelay({ kind: 'error' }, T0, n)), [10_000, 20_000, 40_000, 60_000, 60_000]);
});
test('Dashy dances to the music only when the driver has nothing urgent', () => {
  for (const r of RULES) {
    const dance = r.rule === 'idle' || r.rule === 'quiet' || r.rule === 'working';
    assert.equal(musicState({ state: r.state, rule: r.rule }, true), dance ? 'dancing' : r.state, r.rule);
    assert.equal(musicState({ state: r.state, rule: r.rule }, false), r.state, 'no music, no change: ' + r.rule);
  }
});
test('vinyl colour: stable per album, from the fixed palette, varied across albums', () => {
  assert.equal(vinylColor('The Romantic|Bruno Mars'), vinylColor('The Romantic|Bruno Mars'));
  const colors = new Set(Array.from({ length: 200 }, (_, i) => vinylColor('album ' + i)));
  assert.ok([...colors].every(c => (VINYL_COLORS as readonly string[]).includes(c)) && colors.size >= 6);
});

// ---------- auth ----------
test('redirect URIs follow Spotify rules', () => {
  for (const ok of ['https://app.example.com/cb', 'http://127.0.0.1:5173/callback', 'http://[::1]:8000/cb', 'https://localhost/cb']) assert.doesNotThrow(() => checkRedirectUri(ok), ok);
  for (const bad of ['http://localhost:5173/cb', 'http://example.com/cb', 'myapp://cb', 'nonsense', 'javascript:alert(1)']) assert.throws(() => checkRedirectUri(bad), AuthError, bad);
});
test('PKCE: verifier alphabet and length, and the RFC 7636 challenge example', async () => {
  const v = randomString(); assert.match(v, /^[A-Za-z0-9\-._~]{96}$/); assert.notEqual(v, randomString());
  assert.equal(randomString(43).length, 43);
  assert.equal(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const bytes = [255, 254, 0, 1]; let i = 0; // biased bytes (>= 198) must be skipped
  assert.equal(randomString(2, a => { a.fill(0); a.forEach((_, k) => { a[k] = bytes[(i + k) % 4]; }); i += a.length; return a; }).length, 2);
});
test('authorize URL has everything Spotify needs and no secret', () => {
  const u = new URL(buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://app/cb', state: 's', challenge: 'c' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize');
  assert.deepEqual(Object.fromEntries(u.searchParams), { client_id: 'cid', response_type: 'code', redirect_uri: 'https://app/cb', state: 's', code_challenge_method: 'S256', code_challenge: 'c', scope: 'user-read-currently-playing user-modify-playback-state' });
});
test('login round trip: begin, return with code, exchange with the verifier, tokens', async () => {
  const pending = store(); let navigated = '';
  await beginLogin({ clientId: 'cid', redirectUri: 'https://app/cb', pending, navigate: u => { navigated = u; } });
  const q = new URL(navigated).searchParams;
  const { verifier, state } = JSON.parse([...pending.m.values()][0]);
  assert.equal(q.get('state'), state); assert.equal(q.get('code_challenge'), await challengeFor(verifier));
  let body: URLSearchParams | undefined, url = '', headers: HeadersInit | undefined;
  const f = (async (u: string, init: RequestInit) => { url = u; body = new URLSearchParams(String(init.body)); headers = init.headers; return json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, token_type: 'Bearer' }); }) as typeof fetch;
  const t = await completeLogin({ clientId: 'cid', callbackUrl: `https://app/cb?code=THECODE&state=${state}`, pending, fetch: f, now: T0 });
  assert.deepEqual(t, { accessToken: 'AT', refreshToken: 'RT', expiresAt: T0 + 3_600_000 });
  assert.equal(url, 'https://accounts.spotify.com/api/token');
  assert.deepEqual(Object.fromEntries(body!), { grant_type: 'authorization_code', code: 'THECODE', redirect_uri: 'https://app/cb', client_id: 'cid', code_verifier: verifier });
  assert.deepEqual(headers, { 'content-type': 'application/x-www-form-urlencoded' }, 'no client secret, no basic auth');
  assert.equal(pending.m.size, 0, 'pending login is single use');
});
test('login return is checked: wrong or missing state, denial, missing code, replay all fail with the right reason', async () => {
  const f = (async () => json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 })) as typeof fetch;
  const attempt = async (cb: (state: string) => string, begin = true) => {
    const pending = store(); if (begin) await beginLogin({ clientId: 'c', redirectUri: 'https://app/cb', pending, navigate: () => {} });
    const state = begin ? JSON.parse([...pending.m.values()][0]).state : 'x';
    return completeLogin({ clientId: 'c', callbackUrl: cb(state), pending, fetch: f, now: T0 }).then(() => 'ok', (e: AuthError) => e.reason);
  };
  assert.equal(await attempt(s => `https://app/cb?code=c&state=${s}`), 'ok');
  assert.equal(await attempt(() => 'https://app/cb?code=c&state=forged'), 'state');
  assert.equal(await attempt(() => 'https://app/cb?code=c'), 'state');
  assert.equal(await attempt(s => `https://app/cb?code=c&state=${s}`, false), 'state', 'login was never started in this browser');
  assert.equal(await attempt(s => `https://app/cb?error=access_denied&state=${s}`), 'denied');
  assert.equal(await attempt(s => `https://app/cb?state=${s}`), 'exchange');
  const pending = store(); await beginLogin({ clientId: 'c', redirectUri: 'https://app/cb', pending, navigate: () => {} });
  const st = JSON.parse([...pending.m.values()][0]).state, url = `https://app/cb?code=c&state=${st}`;
  await completeLogin({ clientId: 'c', callbackUrl: url, pending, fetch: f, now: T0 });
  await assert.rejects(completeLogin({ clientId: 'c', callbackUrl: url, pending, fetch: f, now: T0 }), (e: AuthError) => e.reason === 'state', 'replaying the same callback fails');
});
test('beginLogin refuses a redirect URI Spotify would reject, before leaving the page', async () => {
  let n = 0; await assert.rejects(beginLogin({ clientId: 'c', redirectUri: 'http://localhost:5173/', pending: store(), navigate: () => { n++; } }), (e: AuthError) => e.reason === 'redirect' && /127\.0\.0\.1/.test(e.message)); assert.equal(n, 0);
});
test('refresh: client_id + refresh token only; keeps the old refresh token when none is returned; invalid_grant means log in again; no secrets in errors', async () => {
  let body: URLSearchParams | undefined;
  const f1 = (async (_u: string, init: RequestInit) => { body = new URLSearchParams(String(init.body)); return json({ access_token: 'AT2', expires_in: 3600 }); }) as typeof fetch;
  assert.deepEqual(await refreshTokens({ clientId: 'cid', refreshToken: 'RT-old', fetch: f1, now: T0 }), { accessToken: 'AT2', refreshToken: 'RT-old', expiresAt: T0 + 3_600_000 });
  assert.deepEqual(Object.fromEntries(body!), { grant_type: 'refresh_token', refresh_token: 'RT-old', client_id: 'cid' });
  const f2 = (async () => json({ access_token: 'AT3', refresh_token: 'RT-new', expires_in: 60 })) as typeof fetch;
  assert.equal((await refreshTokens({ clientId: 'c', refreshToken: 'RT-old', fetch: f2, now: T0 })).refreshToken, 'RT-new');
  const f3 = (async () => json({ error: 'invalid_grant', error_description: 'Refresh token revoked RT-old' }, 400)) as typeof fetch;
  await assert.rejects(refreshTokens({ clientId: 'c', refreshToken: 'RT-old', fetch: f3, now: T0 }), (e: AuthError) => e.reason === 'expired' && !e.message.includes('RT-old'));
  const f4 = (async () => json({ nope: 1 })) as typeof fetch;
  await assert.rejects(refreshTokens({ clientId: 'c', refreshToken: 'x', fetch: f4, now: T0 }), (e: AuthError) => e.reason === 'exchange');
});
test('stored tokens: round trip, and garbage in storage is ignored', () => {
  const s = store(); assert.equal(loadTokens(s), null);
  saveTokens(s, { accessToken: 'a', refreshToken: 'r', expiresAt: 5 }); assert.deepEqual(loadTokens(s), { accessToken: 'a', refreshToken: 'r', expiresAt: 5 });
  for (const junk of ['{', 'null', '[]', '{"accessToken":1}']) { s.m.set('dashy.spotify.tokens', junk); assert.equal(loadTokens(s), null, junk); }
});

// ---------- client ----------
test('currently-playing call: bearer token, every status becomes a result, never throws or hangs', async () => {
  let auth = '';
  const f = (status: number, body: unknown = null, headers: Record<string, string> = {}) => (async (_u: string, init: RequestInit) => { auth = new Headers(init.headers).get('authorization')!; return status === 204 ? new Response(null, { status }) : json(body, status, headers); }) as typeof fetch;
  assert.equal((await fetchCurrentlyPlaying({ accessToken: 'AT', fetch: f(200, track()), now: () => T0 })).kind, 'playing'); assert.equal(auth, 'Bearer AT');
  assert.deepEqual(await fetchCurrentlyPlaying({ accessToken: 'AT', fetch: f(204) }), { kind: 'nothing' });
  assert.deepEqual(await fetchCurrentlyPlaying({ accessToken: 'AT', fetch: f(200, track({ currently_playing_type: 'ad' })) }), { kind: 'nothing' });
  assert.deepEqual(await fetchCurrentlyPlaying({ accessToken: 'AT', fetch: f(401, {}) }), { kind: 'unauthorized' });
  assert.deepEqual(await fetchCurrentlyPlaying({ accessToken: 'AT', fetch: f(403, {}) }), { kind: 'forbidden' });
  assert.deepEqual(await fetchCurrentlyPlaying({ accessToken: 'AT', fetch: f(429, {}, { 'retry-after': '7' }) }), { kind: 'rate-limited', retryAfterMs: 7000 });
  assert.deepEqual(await fetchCurrentlyPlaying({ accessToken: 'AT', fetch: f(429, {}) }), { kind: 'rate-limited', retryAfterMs: 5000 });
  for (const s of [500, 502, 400]) assert.deepEqual(await fetchCurrentlyPlaying({ accessToken: 'AT', fetch: f(s, {}) }), { kind: 'error' });
  assert.deepEqual(await fetchCurrentlyPlaying({ accessToken: 'AT', fetch: (async () => new Response('<html>', { status: 200 })) as typeof fetch }), { kind: 'nothing' });
  assert.deepEqual(await fetchCurrentlyPlaying({ accessToken: 'AT', fetch: (async () => { throw new TypeError('offline'); }) as typeof fetch }), { kind: 'error' });
  assert.deepEqual(await fetchCurrentlyPlaying({ accessToken: 'AT', timeoutMs: 30, fetch: (() => new Promise<Response>(() => {})) as typeof fetch }), { kind: 'error' });
});

// ---------- session ----------
function harness(over: Record<string, unknown> = {}) {
  const tokens = store(), pending = store();
  let clock = T0; const timers: { fn: () => void; at: number; id: number }[] = []; let nid = 0;
  let calls: { url: string; init: RequestInit }[] = []; let respond: (url: string, init: RequestInit) => Response | Promise<Response> = () => json(track());
  const fetchFn = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return respond(url, init); }) as typeof fetch;
  const s = createSpotifySession({ clientId: 'cid', redirectUri: 'https://app/cb', tokens, pending, fetch: fetchFn, now: () => clock,
    setTimeout: (fn, ms) => { const id = ++nid; timers.push({ fn, at: clock + ms, id }); return id; }, clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    navigate: u => { navigated.push(u); }, currentUrl: () => url, replaceUrl: u => { url = u; }, isVisible: () => visible, ...over });
  const navigated: string[] = []; let url = 'https://app/'; let visible = true;
  return { s, tokens, pending, navigated, get calls() { return calls; }, set respond(r: typeof respond) { respond = r; }, get timers() { return timers; }, set url(u: string) { url = u; }, get url() { return url; }, set visible(v: boolean) { visible = v; },
    async tick(ms: number) { clock += ms; const due = timers.filter(t => t.at <= clock).sort((a, b) => a.at - b.at); for (const t of due) { timers.splice(timers.indexOf(t), 1); t.fn(); } await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); }, set clock(v: number) { clock = v; }, get clock() { return clock; } };
}
const login = (h: ReturnType<typeof harness>) => saveTokens(h.tokens, { accessToken: 'AT', refreshToken: 'RT', expiresAt: T0 + 3_600_000 });


test('session: no saved login -> disconnected; no calls to Spotify', async () => {
  const h = harness(); await h.s.start(); assert.equal(h.s.getState().status, 'disconnected'); assert.equal(h.calls.length, 0);
});
test('session: saved login -> connecting -> connected with the track, then polls every 5 s while playing', async () => {
  const h = harness(); login(h); const seen: string[] = []; h.s.subscribe(() => seen.push(h.s.getState().status));
  await h.s.start();
  assert.deepEqual(seen, ['connecting', 'connected']); assert.equal(h.s.getState().nowPlaying?.title, 'Die With A Smile');
  assert.equal(h.calls.length, 1); await h.tick(4999); assert.equal(h.calls.length, 1); await h.tick(2); assert.equal(h.calls.length, 2);
  h.s.stop();
});
test('session: nothing playing is "connected" with no track, and it polls every 10 s', async () => {
  const h = harness(); login(h); h.respond = () => new Response(null, { status: 204 });
  await h.s.start(); assert.deepEqual([h.s.getState().status, h.s.getState().nowPlaying], ['connected', null]);
  await h.tick(9000); assert.equal(h.calls.length, 1); await h.tick(1500); assert.equal(h.calls.length, 2); h.s.stop();
});
test('session: a track change and pausing show up on the next poll', async () => {
  const h = harness(); login(h); await h.s.start();
  h.respond = () => json(track({ is_playing: false, item: { ...track().item, name: 'Other' } })); await h.tick(5100);
  assert.deepEqual([h.s.getState().nowPlaying?.title, h.s.getState().nowPlaying?.playing], ['Other', false]); h.s.stop();
});
test('session: an expired access token is refreshed first (one refresh, even with overlapping polls), and the new token is saved', async () => {
  const h = harness(); saveTokens(h.tokens, { accessToken: 'OLD', refreshToken: 'RT', expiresAt: T0 + 10_000 });
  h.respond = (url, init) => url.includes('/api/token') ? json({ access_token: 'NEW', expires_in: 3600 }) : json(track());
  await h.s.start();
  assert.equal(h.calls.filter(c => c.url.includes('/api/token')).length, 1);
  assert.equal(new Headers(h.calls[h.calls.length - 1].init.headers).get('authorization'), 'Bearer NEW'); assert.equal(loadTokens(h.tokens)!.accessToken, 'NEW'); assert.equal(loadTokens(h.tokens)!.refreshToken, 'RT'); h.s.stop();
});
test('session: a 401 triggers one refresh and a retry; a revoked grant logs out cleanly', async () => {
  let h = harness(); login(h); let first = true;
  h.respond = (url) => url.includes('/api/token') ? json({ access_token: 'AT2', expires_in: 3600 }) : (first ? ((first = false), json({}, 401)) : json(track()));
  await h.s.start(); assert.equal(h.s.getState().status, 'connected'); h.s.stop();
  h = harness(); login(h);
  h.respond = (url) => url.includes('/api/token') ? json({ error: 'invalid_grant' }, 400) : json({}, 401);
  await h.s.start(); assert.equal(h.s.getState().status, 'disconnected'); assert.equal(loadTokens(h.tokens), null, 'dead tokens are removed'); assert.equal(h.timers.length, 0, 'and polling stops');
});
test('session: 403 explains the allowlist; offline shows a calm message; both back off and recover', async () => {
  const h = harness(); login(h); h.respond = () => json({}, 403); await h.s.start();
  assert.deepEqual([h.s.getState().status, h.s.getState().error], ['error', MESSAGES.forbidden]);
  h.respond = () => { throw new TypeError('offline'); }; await h.tick(10_100); assert.equal(h.s.getState().error, MESSAGES.offline);
  assert.equal(h.timers[0].at - h.clock, 20_000, 'second error: backoff doubled');
  h.respond = () => json(track()); await h.tick(20_100); assert.equal(h.s.getState().status, 'connected'); assert.equal(h.s.getState().error, undefined); h.s.stop();
});
test('session: 429 waits as long as Spotify says and keeps showing the track', async () => {
  const h = harness(); login(h); await h.s.start();
  h.respond = () => json({}, 429, { 'retry-after': '30' }); await h.tick(5100);
  assert.equal(h.s.getState().status, 'connected'); assert.equal(h.s.getState().nowPlaying?.title, 'Die With A Smile');
  assert.equal(h.timers[0].at - h.clock, 30_000); h.s.stop();
});
test('session: pauses while the window is hidden and nudge() asks right away when it is visible again', async () => {
  const h = harness(); login(h); await h.s.start(); h.visible = false; const n = h.calls.length;
  await h.tick(20_000); assert.equal(h.calls.length, n); h.visible = true; h.s.nudge(); await new Promise(r => setImmediate(r)); assert.equal(h.calls.length, n + 1); h.s.stop();
});
test('session: login return with code completes, cleans the address bar, and connects', async () => {
  const h = harness(); await h.s.connect(); const st = new URL(h.navigated[0]).searchParams.get('state');
  h.url = `https://app/cb?code=C&state=${st}&keep=1`;
  h.respond = (url) => url.includes('/api/token') ? json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }) : json(track());
  await h.s.start();
  assert.equal(h.s.getState().status, 'connected'); assert.equal(h.url, 'https://app/cb?keep=1'); assert.equal(loadTokens(h.tokens)!.refreshToken, 'RT'); h.s.stop();
});
test('session: denied or forged login return shows a message and removes the code from the URL', async () => {
  let h = harness(); await h.s.connect(); const st = new URL(h.navigated[0]).searchParams.get('state'); h.url = `https://app/cb?error=access_denied&state=${st}`;
  await h.s.start(); assert.deepEqual([h.s.getState().status, h.s.getState().error], ['error', MESSAGES.denied]); assert.equal(h.url, 'https://app/cb'); assert.equal(h.calls.length, 0);
  h = harness(); h.url = 'https://app/cb?code=C&state=forged'; await h.s.start(); assert.equal(h.s.getState().error, MESSAGES.login); assert.equal(h.calls.length, 0, 'no token request for a forged state'); assert.equal(loadTokens(h.tokens), null);
});
test('session: connect with a bad redirect URI shows the reason instead of leaving the page; disconnect clears everything', async () => {
  const bad = harness({ redirectUri: 'http://localhost:5173/' }); await bad.s.connect(); assert.equal(bad.s.getState().error, MESSAGES.redirect); assert.equal(bad.navigated.length, 0);
  const h = harness(); login(h); await h.s.start(); h.s.disconnect();
  assert.deepEqual([h.s.getState().status, h.s.getState().nowPlaying, loadTokens(h.tokens), h.timers.length], ['disconnected', null, null, 0]);
});
test('session: stop() cancels timers and ignores answers that arrive late', async () => {
  const h = harness(); login(h); let release!: (r: Response) => void; h.respond = () => new Promise<Response>(r => { release = r; });
  const started = h.s.start(); await new Promise(r => setImmediate(r)); h.s.stop(); release(json(track())); await started;
  assert.notEqual(h.s.getState().status, 'connected'); assert.equal(h.timers.length, 0);
});


test('session: returning from Spotify works when start() runs twice (React StrictMode in development)', async () => {
  const h = harness();
  await h.s.connect();
  const state = new URL(h.navigated[0]).searchParams.get('state')!;
  h.url = `https://app/cb?code=THECODE&state=${state}`;
  h.respond = url => url.includes('/api/token') ? json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }) : json(track());
  const first = h.s.start(); h.s.stop(); const second = h.s.start(); // mount, cleanup, mount again before the first one is done
  await Promise.all([first, second]);
  assert.equal(h.s.getState().status, 'connected', JSON.stringify(h.s.getState()));
  assert.equal(h.s.getState().error, undefined);
  assert.equal(h.calls.filter(c => c.url.includes('/api/token')).length, 1, 'the single-use code is exchanged once');
  assert.equal(h.url, 'https://app/cb', 'code and state are removed from the address bar');
  assert.equal(loadTokens(h.tokens)!.refreshToken, 'RT'); h.s.stop();
});


// ---------- controls ----------
const resp = (status: number, body?: unknown) => async () => new Response(body === undefined ? null : JSON.stringify(body), { status });
test('sendCommand: right method and path per command, and every outcome is a result (never a throw)', async () => {
  const seen: { url: string; method?: string; auth: string | null }[] = [];
  const f = (async (url: string, init: RequestInit) => { seen.push({ url, method: init.method, auth: new Headers(init.headers).get('authorization') }); return new Response(null, { status: 204 }); }) as typeof fetch;
  for (const command of ['play', 'pause', 'next', 'previous'] as const) assert.deepEqual(await sendCommand({ accessToken: 'AT', command, fetch: f }), { kind: 'ok' });
  assert.deepEqual(seen.map(x => `${x.method} ${x.url.replace('https://api.spotify.com/v1/me/player/', '')}`), ['PUT play', 'PUT pause', 'POST next', 'POST previous']);
  assert.ok(seen.every(x => x.auth === 'Bearer AT'));
  const r = (status: number, body?: unknown) => sendCommand({ accessToken: 'AT', command: 'next', fetch: resp(status, body) as unknown as typeof fetch });
  assert.deepEqual(await r(401), { kind: 'unauthorized' }); assert.deepEqual(await r(429), { kind: 'rate-limited' });
  assert.deepEqual(await r(403, { error: { reason: 'PREMIUM_REQUIRED' } }), { kind: 'premium' }); assert.deepEqual(await r(403, {}), { kind: 'forbidden' });
  assert.deepEqual(await r(404, { error: { reason: 'NO_ACTIVE_DEVICE' } }), { kind: 'no-device' }); assert.deepEqual(await r(502), { kind: 'error' });
  assert.deepEqual(await sendCommand({ accessToken: 'AT', command: 'next', fetch: (async () => { throw new TypeError('offline'); }) as typeof fetch }), { kind: 'error' });
  assert.deepEqual(await sendCommand({ accessToken: 'AT', command: 'next', timeoutMs: 30, fetch: (() => new Promise<Response>(() => {})) as typeof fetch }), { kind: 'error' });
});
test('scope: the login asks for the control scope, remembers what was granted, and old logins do not have it', async () => {
  assert.ok(new URL(buildAuthorizeUrl({ clientId: 'c', redirectUri: 'https://app/cb', state: 's', challenge: 'c' })).searchParams.get('scope')!.split(' ').includes(CONTROL_SCOPE));
  assert.equal(hasScope(null, CONTROL_SCOPE), false); assert.equal(hasScope({}, CONTROL_SCOPE), false); assert.equal(hasScope({ scope: `user-read-currently-playing ${CONTROL_SCOPE}` }, CONTROL_SCOPE), true);
  assert.equal(hasScope({ scope: 'user-read-currently-playing' }, CONTROL_SCOPE), false); assert.equal(hasScope({ scope: 'x' + CONTROL_SCOPE }, CONTROL_SCOPE), false, 'whole words only');
  const f = (async () => json({ access_token: 'A', refresh_token: 'R', expires_in: 3600, scope: `user-read-currently-playing ${CONTROL_SCOPE}` })) as unknown as typeof fetch;
  assert.equal((await refreshTokens({ clientId: 'c', refreshToken: 'R', fetch: f, now: T0 })).scope, `user-read-currently-playing ${CONTROL_SCOPE}`);
});
const loginWith = (h: ReturnType<typeof harness>, scope?: string) => saveTokens(h.tokens, { accessToken: 'AT', refreshToken: 'RT', expiresAt: T0 + 3_600_000, ...(scope ? { scope } : {}) });
const withControl = `user-read-currently-playing ${CONTROL_SCOPE}`;

test('session control: an old login (no scope) cannot control, says so, and sends nothing', async () => {
  const h = harness(); loginWith(h); await h.s.start();
  assert.deepEqual([h.s.canControl(), h.s.needsReconnect()], [false, true]);
  const before = h.calls.length;
  assert.equal(await h.s.control('pause'), false); assert.equal(h.calls.length, before); assert.equal(h.s.getState().controlError, MESSAGES.reconnect); h.s.stop();
});
test('session control: pause shows at once, keeps the position, asks Spotify again soon, and the next poll clears the message', async () => {
  const h = harness(); loginWith(h, withControl); await h.s.start();
  assert.deepEqual([h.s.canControl(), h.s.needsReconnect()], [true, false]);
  h.respond = (u, init) => (u.endsWith('/pause') ? new Response(null, { status: 204 }) : json(track({ is_playing: false })));
  const polls = () => h.calls.filter(c => c.url.includes('currently-playing')).length, p0 = polls();
  await h.tick(3000); assert.equal(await h.s.control('pause'), true); // 3 s after the last answer, before the next poll
  const cmd = h.calls.find(c => c.url.endsWith('/pause'))!; assert.equal(cmd.init.method, 'PUT'); assert.equal(new Headers(cmd.init.headers).get('authorization'), 'Bearer AT');
  const np = h.s.getState().nowPlaying!; assert.equal(np.playing, false); assert.equal(np.progressMs, 33_000, 'it froze at the position reached (30 s + 3 s of play)');
  await h.tick(1000); assert.ok(polls() > p0, 'it asked Spotify what is really playing'); assert.equal(h.s.getState().controlError, undefined); h.s.stop();
});
test('session control: Premium, no device and other failures each get a calm message; the track on screen stays', async () => {
  const h = harness(); loginWith(h, withControl); await h.s.start(); const title = h.s.getState().nowPlaying!.title;
  for (const [res, msg] of [[new Response(JSON.stringify({ error: { reason: 'PREMIUM_REQUIRED' } }), { status: 403 }), MESSAGES.premium], [new Response(JSON.stringify({ error: { reason: 'NO_ACTIVE_DEVICE' } }), { status: 404 }), MESSAGES.noDevice], [new Response(null, { status: 500 }), MESSAGES.controlFailed], [new Response(JSON.stringify({}), { status: 403 }), MESSAGES.reconnect]] as const) {
    h.respond = (u) => (u.includes('/me/player/next') ? res.clone() : json(track())); assert.equal(await h.s.control('next'), false); assert.equal(h.s.getState().controlError, msg); assert.equal(h.s.getState().nowPlaying!.title, title);
  }
  h.respond = () => { throw new TypeError('offline'); }; assert.equal(await h.s.control('next'), false); assert.equal(h.s.getState().controlError, MESSAGES.controlFailed); h.s.stop();
});
test('session control: an expired token is refreshed once and the command is retried', async () => {
  const h = harness(); loginWith(h, withControl); await h.s.start(); let n = 0;
  h.respond = (u) => u.includes('accounts.spotify.com') ? json({ access_token: 'AT2', expires_in: 3600 }) : u.endsWith('/play') ? (n++ === 0 ? new Response(null, { status: 401 }) : new Response(null, { status: 204 })) : json(track());
  assert.equal(await h.s.control('play'), true); assert.equal(n, 2);
  assert.equal(new Headers(h.calls.filter(c => c.url.endsWith('/play')).pop()!.init.headers).get('authorization'), 'Bearer AT2');
  assert.equal(loadTokens(h.tokens)!.scope, withControl, 'the refresh did not lose the scope'); h.s.stop();
});
test('session control: without a login nothing is sent', async () => {
  const h = harness(); await h.s.start(); assert.equal(await h.s.control('play'), false); assert.equal(h.calls.length, 0);
});
