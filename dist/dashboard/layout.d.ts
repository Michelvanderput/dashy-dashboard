/**
 * The screen is a grid of five blocks. The layout never changes shape while you use it: only the track sizes (fr)
 * change when a block needs attention, so the browser can animate the grid itself and every block's content simply reflows.
 * Pure: no DOM.
 */
export declare const BLOCKS: readonly ['dashy', 'now', 'plan', 'music', 'clock'];
export type BlockId = (typeof BLOCKS)[number];
export type Orientation = 'landscape' | 'portrait';
/** How much more room the tracks of a block in focus get, relative to the others. */
export declare const GROW = 3;
export interface Tracks {
    areas: string;
    cols: string;
    rows: string;
    colFr: number[];
    rowFr: number[];
}
/** Orientation from the window shape: taller than wide = portrait. */
export declare const orientationOf: (width: number, height: number) => Orientation;
/** CSS values for the grid, for a block in focus (or null: the calm default). The number of tracks never changes per orientation. */
export declare function tracksFor(o: Orientation, focus: BlockId | null): Tracks;
/** Share of the screen (0..1) a block's cells take with these tracks (gaps ignored). */
export declare function areaShare(o: Orientation, focus: BlockId | null, block: BlockId): number;
