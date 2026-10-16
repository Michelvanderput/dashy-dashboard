/** Where Dashy looks: towards the centre of another block, as a "pointer" in -1..1 for core.ts. Pure. */
export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}
/**
 * `me` = Dashy's block, `target` = the block he looks at, `root` = the whole screen.
 * A block a third of the screen away makes him look fully that way; nearer blocks less. Returns null when nothing can be measured.
 */
export declare function aimAt(me: Rect, target: Rect, root: Rect): {
    nx: number;
    ny: number;
} | null;
