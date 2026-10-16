import type { PlanItem } from '../src/dashboard/plan';
import type { NowPlaying } from '../src/spotify/model';

const MIN = 60_000;

/** A believable day, relative to now, so the calm start is always calm. */
export function seedItems(now: number): PlanItem[] {
  return [
    { id: 'overleg', kind: 'event', title: 'Overleg met Sanne', at: now + 95 * MIN, endsAt: now + 125 * MIN, note: 'Teams, agenda doornemen' },
    { id: 'offerte', kind: 'task', title: 'Offerte sturen', at: now + 4 * 60 * MIN, note: 'Klant wacht op prijs' },
    { id: 'rapport', kind: 'task', title: 'Rapport nakijken', at: now + 6 * 60 * MIN },
    { id: 'boodschappen', kind: 'task', title: 'Boodschappen', at: null },
  ];
}

const art = (a: string, b: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><rect width="640" height="640" fill="${a}"/><circle cx="320" cy="320" r="210" fill="${b}"/><circle cx="320" cy="320" r="70" fill="${a}"/></svg>`)}`;

/** Fake track for the demo (own artwork, no Spotify). */
export function demoTrack(now: number, playing: boolean, n = 0): NowPlaying {
  const tracks = [['Midnight Roses', 'The Placeholders', 'Test Album', '#f3efe6', '#b3202a'], ['Slow Morning', 'Lorem Ipsum', 'Quiet Hours', '#16324f', '#f2c14e']] as const;
  const [title, artist, album, a, b] = tracks[n % tracks.length];
  return { id: `demo-${n}`, title, artists: [artist], album, coverUrl: art(a, b), trackUrl: null, durationMs: 214_000, progressMs: 62_000, playing, fetchedAt: now };
}
