/** Where Dashy looks: towards the centre of another block, as a "pointer" in -1..1 for core.ts. Pure. */
export interface Rect { left: number; top: number; width: number; height: number }

/**
 * `me` = Dashy's block, `target` = the block he looks at, `root` = the whole screen.
 * A block a third of the screen away makes him look fully that way; nearer blocks less. Returns null when nothing can be measured.
 */
export function aimAt(me: Rect, target: Rect, root: Rect): { nx: number; ny: number } | null {
  if (!me.width || !root.width || !root.height) return null;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const nx = (target.left + target.width / 2 - (me.left + me.width / 2)) / (root.width / 3);
  const ny = (target.top + target.height / 2 - (me.top + me.height / 2)) / (root.height / 3);
  return Number.isFinite(nx) && Number.isFinite(ny) ? { nx: clamp(nx), ny: clamp(ny) } : null;
}
