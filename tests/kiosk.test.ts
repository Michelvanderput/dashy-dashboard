import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { burnInOffset, isKiosk } from '../src/kiosk';

test('kiosk is switched on by ?kiosk=1 and nothing else', () => {
  for (const on of ['?kiosk=1', '?kiosk', '?x=1&kiosk=true', '?kiosk=yes']) assert.equal(isKiosk(on), true, on);
  for (const off of ['', '?', '?kiosk=0', '?kiosk=false', '?kiosk=FALSE', '?other=1', '?kioskx=1']) assert.equal(isKiosk(off), false, off);
});
test('burn-in shift: small, steady within a period, changing between periods, and the same for the same time', () => {
  const T = 1_700_000_000_000, P = 3 * 60_000;
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) { const o = burnInOffset(T + i * P); assert.ok(Math.abs(o.x) <= 6 && Math.abs(o.y) <= 6 && Number.isInteger(o.x) && Number.isInteger(o.y)); seen.add(`${o.x},${o.y}`); }
  assert.ok(seen.size > 40, `it actually moves around (${seen.size} different places)`);
  const base = Math.floor(T / P) * P;
  assert.deepEqual(burnInOffset(base), burnInOffset(base + P - 1), 'steady inside one period'); assert.deepEqual(burnInOffset(T), burnInOffset(T));
  assert.deepEqual(burnInOffset(T, 0), { x: 0, y: 0 }, 'max 0 means no shift'); assert.ok(Math.abs(burnInOffset(T, 2).x) <= 2);
});
test('the service worker only touches same-origin GET requests outside /api and is network first', () => {
  const sw = readFileSync('app/public/sw.js', 'utf8');
  assert.match(sw, /req\.method !== 'GET'/); assert.match(sw, /url\.origin !== self\.location\.origin/); assert.match(sw, /startsWith\('\/api\/'\)/);
  assert.ok(sw.indexOf('fetch(req)') < sw.indexOf('caches.match'), 'network first, cache only as the fallback');
  assert.doesNotMatch(sw, /cache\.addAll|precache/i, 'nothing is cached ahead of time, so there is no stale app to get stuck on');
});
test('the manifest makes it installable', () => {
  const m = JSON.parse(readFileSync('app/public/manifest.webmanifest', 'utf8'));
  assert.equal(m.display, 'standalone'); assert.equal(m.start_url, '/'); assert.ok(m.icons.some((i: { sizes: string }) => i.sizes === '192x192') && m.icons.some((i: { sizes: string }) => i.sizes === '512x512'));
});
