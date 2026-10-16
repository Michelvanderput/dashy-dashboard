import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockParts, isoWeek, msToNextMinute } from '../src/clock';
import { DEFAULT_PLACE, describeWeather, parsePlace, parseWeather, rainNote, weatherUrl } from '../src/weather';
import { zonedToEpoch } from '../src/server/time';

const at = (d: string, t: string) => { const [y, m, da] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number); return zonedToEpoch(y, m, da, h, mi)!; };

test('clock: time and date in Dutch, in Dutch time, also around midnight and a clock change', () => {
  assert.deepEqual(clockParts(at('2026-10-16', '14:05')), { time: '14:05', date: 'vrijdag 16 oktober', week: 42, hour: 14, iso: '2026-10-16T14:05' });
  assert.equal(clockParts(at('2026-10-17', '00:00')).date, 'zaterdag 17 oktober'); assert.equal(clockParts(at('2026-10-17', '00:00')).time, '00:00');
  assert.equal(clockParts(at('2026-12-31', '23:59')).time, '23:59');
  assert.equal(clockParts(Date.UTC(2026, 9, 16, 22, 30)).time, '00:30', 'UTC 22:30 is 00:30 the next day in the Netherlands (summer time)');
  assert.equal(clockParts(Date.UTC(2026, 9, 16, 22, 30)).date, 'zaterdag 17 oktober');
  assert.equal(clockParts(at('2026-10-25', '03:30')).time, '03:30', 'after the clocks went back');
  for (const [m, name] of [[1, 'januari'], [3, 'maart'], [5, 'mei'], [8, 'augustus'], [12, 'december']] as const) assert.ok(clockParts(at(`2026-${String(m).padStart(2, '0')}-10`, '12:00')).date.endsWith(name));
});
test('iso week numbers, including the year edges', () => {
  assert.equal(isoWeek(2026, 10, 16), 42); assert.equal(isoWeek(2026, 1, 1), 1); assert.equal(isoWeek(2026, 12, 31), 53); assert.equal(isoWeek(2027, 1, 1), 53, '1 Jan 2027 (a Friday) still belongs to week 53 of 2026');
  assert.equal(isoWeek(2024, 12, 30), 1, 'Monday 30 Dec 2024 is week 1 of 2025'); assert.equal(isoWeek(2021, 1, 3), 53); assert.equal(isoWeek(2026, 10, 12), 42); assert.equal(isoWeek(2026, 10, 18), 42, 'Sunday still in the same week'); assert.equal(isoWeek(2026, 10, 19), 43);
});
test('the minute timer fires just after the minute changes, never before', () => {
  assert.equal(msToNextMinute(120_000), 60_030); assert.equal(msToNextMinute(119_999), 31); assert.equal(msToNextMinute(0), 60_030);
  for (let t = 0; t < 200_000; t += 997) { const next = t + msToNextMinute(t); assert.equal(Math.floor(next / 60_000), Math.floor(t / 60_000) + 1); }
});

test('weather codes become Dutch words and an icon, day and night', () => {
  assert.deepEqual(describeWeather(0, true), { label: 'Zonnig', icon: 'sun' }); assert.deepEqual(describeWeather(0, false), { label: 'Helder', icon: 'moon' });
  assert.equal(describeWeather(2, false).icon, 'partly-night'); assert.equal(describeWeather(3, true).label, 'Bewolkt'); assert.equal(describeWeather(45, true).icon, 'fog'); assert.equal(describeWeather(53, true).icon, 'drizzle');
  assert.equal(describeWeather(63, true).label, 'Regen'); assert.equal(describeWeather(81, true).label, 'Buien'); assert.equal(describeWeather(73, true).icon, 'snow'); assert.equal(describeWeather(95, true).icon, 'thunder');
  assert.deepEqual(describeWeather(1234, true), { label: 'Wisselend', icon: 'cloud' }, 'an unknown code never breaks the screen');
  for (let c = 0; c <= 99; c++) { const d = describeWeather(c, true); assert.ok(d.label && d.icon, String(c)); }
});
// the real shape of an Open-Meteo answer (fetched for this project)
const REAL = { latitude: 50.854, longitude: 5.684, timezone: 'Europe/Amsterdam', current: { time: '2026-10-16T22:00', temperature_2m: 16.2, weather_code: 3, is_day: 0 }, daily: { time: ['2026-10-16'], temperature_2m_max: [21.8], temperature_2m_min: [13.5], precipitation_probability_max: [92] } };
test('weather: the real answer is read, anything odd is refused', () => {
  const w = parseWeather(REAL, 123)!;
  assert.deepEqual([w.tempC, w.code, w.isDay, w.highC, w.lowC, w.rainChance, w.label, w.icon, w.fetchedAt], [16.2, 3, false, 21.8, 13.5, 92, 'Bewolkt', 'cloud', 123]);
  assert.equal(rainNote(w), '92% kans op regen');
  const noDaily = parseWeather({ current: REAL.current }, 1)!; assert.deepEqual([noDaily.highC, noDaily.lowC, noDaily.rainChance], [null, null, null]); assert.equal(rainNote(noDaily), null);
  for (const bad of [null, 5, 'x', {}, { current: null }, { current: { temperature_2m: '16', weather_code: 3 } }, { current: { temperature_2m: 16, weather_code: null } }, { current: { temperature_2m: 999, weather_code: 3 } }, { current: { temperature_2m: NaN, weather_code: 3 } }]) assert.equal(parseWeather(bad, 1), null, JSON.stringify(bad));
  assert.equal(rainNote({ ...w, rainChance: 20 }), null); assert.equal(rainNote({ ...w, rainChance: 40 }), '40% kans op regen'); assert.equal(rainNote({ ...w, rainChance: 80, icon: 'snow' }), null);
  assert.equal(parseWeather({ current: { ...REAL.current, is_day: 1 } }, 1)!.isDay, true); assert.equal(parseWeather({ current: { temperature_2m: 5, weather_code: 0 }, daily: { precipitation_probability_max: [250] } }, 1)!.rainChance, 100, 'clamped');
});
test('place: parsed from "Name:lat,lon", the default for anything else, and the url only holds numbers', () => {
  assert.deepEqual(parsePlace('Amsterdam:52.37,4.89'), { name: 'Amsterdam', lat: 52.37, lon: 4.89 }); assert.deepEqual(parsePlace(' Sydney : -33.87 , 151.21 '), { name: 'Sydney', lat: -33.87, lon: 151.21 });
  for (const bad of [undefined, '', 'Maastricht', 'X:91,5', 'X:50,181', 'X:a,b', ':50,5', 'X:50.85;5.69', '<script>:1,1']) assert.deepEqual(parsePlace(bad), DEFAULT_PLACE, String(bad));
  const url = weatherUrl({ name: 'x', lat: 50.85, lon: 5.69 });
  assert.ok(url.startsWith('https://api.open-meteo.com/v1/forecast?latitude=50.85&longitude=5.69&')); assert.match(url, /current=temperature_2m,weather_code,is_day/); assert.doesNotMatch(url, /[<>"' ]/);
});

import { taskTiming } from '../src/day';
import { nowTask } from '../src/tasks';
test('taskTiming: countdown within three hours, "soon" within half an hour, passed is not late', () => {
  const now = 1_000_000_000_000, m = 60_000;
  assert.deepEqual(taskTiming({ due: now + 20 * m, when: 'x' }, now), { chip: 'over 20 min', soon: true, passed: false });
  assert.equal(taskTiming({ due: now + 2 * 60 * m, when: 'x' }, now).soon, false);
  assert.equal(taskTiming({ due: now + 5 * 60 * m, when: 'morgen 9:00' }, now).chip, 'morgen 9:00');
  assert.equal(taskTiming({ due: now - m, when: 'x' }, now).passed, true);
  assert.deepEqual(taskTiming({ due: null, when: '' }, now), { chip: null, soon: false, passed: false });
});
test('nowTask: the first task whose state is now, or null', () => {
  const t = (id: string, state: 'now' | 'later') => ({ id, title: id, category: 'werk', due: null, when: '', note: '', state });
  assert.equal(nowTask({ tasks: [t('a', 'later'), t('b', 'now')] } as never)?.id, 'b');
  assert.equal(nowTask({ tasks: [t('a', 'later')] } as never), null);
});

import { readFileSync } from 'node:fs';
test('a dashboard never scrolls: the page is locked to the screen and every block is clipped, not stretched', () => {
  const css = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  assert.match(css, /html,body\{[^}]*height:100%;overflow:hidden/);
  assert.match(css, /\.dash\{[^}]*height:100dvh;overflow:hidden/);
  assert.doesNotMatch(css, /min-height:100dvh/);
});

import { briefing, briefingKind } from '../src/briefing';
test('briefing: a plan in the morning, a nudge in the afternoon, a check-in in the evening, nothing at night', () => {
  const at = (h: number, m = 0) => zonedToEpoch(2026, 10, 16, h, m)!;
  const t = (id: string, title: string, state: 'now' | 'later', when = '') => ({ id, title, category: 'thuis', due: null, when, note: '', state });
  const snap = (o: object) => ({ tasks: [t('a', 'Bel de bank', 'now'), t('b', 'Dozen inpakken', 'later', 'vandaag 15:00')], leftOpen: [], doneToday: 0, appointment: null, mode: 'work', hours: { unbookedMin: 0 }, ...o }) as never;
  assert.equal(briefingKind(at(4, 59)), null); assert.equal(briefingKind(at(5)), 'morning'); assert.equal(briefingKind(at(11)), 'midday'); assert.equal(briefingKind(at(17)), 'evening'); assert.equal(briefingKind(at(23)), null);
  const m = briefing(snap({ appointment: { title: 'Standup', at: at(10, 25), endsAt: null }, leftOpen: ['x'] }), at(8))!;
  assert.equal(m.title, 'ochtendplan'); assert.deepEqual(m.items, ['10:25 Standup', 'Bel de bank', 'Dozen inpakken · vandaag 15:00', '1 nog open van eerder, kies zelf wanneer']);
  assert.match(briefing(snap({}), at(13))!.lead, /nog niets afgevinkt, dat mag/);
  assert.match(briefing(snap({ doneToday: 3 }), at(13))!.lead, /^3 klaar vandaag/);
  const e = briefing(snap({ doneToday: 1, hours: { unbookedMin: 90 } }), at(19))!;
  assert.equal(e.lead, '1 ding klaar vandaag. dat telt.'); assert.equal(e.items[0], 'uren boeken, dan is het klaar');
  assert.equal(briefing(snap({}), at(23, 30)), null); assert.equal(briefing(null, at(8)), null);
  assert.equal(briefing(snap({ tasks: [] }), at(8)), null);
  const many = briefing(snap({ tasks: [1, 2, 3, 4, 5, 6].map(i => t(`i${i}`, `Taak ${i}`, 'now')) }), at(8))!;
  assert.equal(many.items.length, 4); assert.equal(many.items[3], 'en nog 3');
  assert.doesNotMatch(JSON.stringify(m), /te laat|achter|gemist/i);
});
