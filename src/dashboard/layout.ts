/**
 * The screen is a grid of five blocks. The layout never changes shape while you use it: only the track sizes (fr)
 * change when a block needs attention, so the browser can animate the grid itself and every block's content simply reflows.
 * Pure: no DOM.
 */
export const BLOCKS = ['dashy', 'now', 'plan', 'music', 'clock'] as const;
export type BlockId = (typeof BLOCKS)[number];
export type Orientation = 'landscape' | 'portrait';

interface Placement { c: number[]; r: number[] }
interface Spec { areas: string[][]; cols: number[]; rows: number[]; at: Record<BlockId, Placement> }

const SPECS: Record<Orientation, Spec> = {
  landscape: {
    areas: [['dashy', 'now', 'plan'], ['music', 'clock', 'plan']],
    cols: [1.2, 1, 1.2], rows: [1.1, 1],
    at: { dashy: { c: [0], r: [0] }, now: { c: [1], r: [0] }, plan: { c: [2], r: [0, 1] }, music: { c: [0], r: [1] }, clock: { c: [1], r: [1] } },
  },
  portrait: {
    areas: [['dashy', 'dashy'], ['now', 'clock'], ['plan', 'plan'], ['music', 'music']],
    cols: [1.2, 1], rows: [1.2, 0.8, 1.3, 0.9],
    at: { dashy: { c: [0, 1], r: [0] }, now: { c: [0], r: [1] }, clock: { c: [1], r: [1] }, plan: { c: [0, 1], r: [2] }, music: { c: [0, 1], r: [3] } },
  },
};

/** How much more room the tracks of a block in focus get, relative to the others. */
export const GROW = 3;
/** Per block and orientation: the small cells in portrait need more room, quiet blocks less. */
/** Music and the clock are quieter moments: they grow less, so Dashy stays big enough to see him dance. */
const GROW_BY: Partial<Record<Orientation, Partial<Record<BlockId, number>>>> = { portrait: { now: 5, clock: 5, music: 2.2 }, landscape: { music: 2.2, clock: 2.4 } };

export interface Tracks { areas: string; cols: string; rows: string; colFr: number[]; rowFr: number[] }

/** Orientation from the window shape: taller than wide = portrait. */
export const orientationOf = (width: number, height: number): Orientation => (height > width ? 'portrait' : 'landscape');

/** CSS values for the grid, for a block in focus (or null: the calm default). The number of tracks never changes per orientation. */
export function tracksFor(o: Orientation, focus: BlockId | null): Tracks {
  const s = SPECS[o], g = (focus && GROW_BY[o]?.[focus]) || GROW;
  const colFr = s.cols.map((v, i) => (focus && s.at[focus].c.includes(i) ? v * g : v));
  const rowFr = s.rows.map((v, i) => (focus && s.at[focus].r.includes(i) ? v * g : v));
  return {
    areas: s.areas.map(r => `"${r.join(' ')}"`).join(' '),
    cols: colFr.map(v => `${+v.toFixed(3)}fr`).join(' '),
    rows: rowFr.map(v => `${+v.toFixed(3)}fr`).join(' '),
    colFr, rowFr,
  };
}

/** Share of the screen (0..1) a block's cells take with these tracks (gaps ignored). */
export function areaShare(o: Orientation, focus: BlockId | null, block: BlockId): number {
  const t = tracksFor(o, focus), p = SPECS[o].at[block];
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return (sum(p.c.map(i => t.colFr[i])) / sum(t.colFr)) * (sum(p.r.map(i => t.rowFr[i])) / sum(t.rowFr));
}
