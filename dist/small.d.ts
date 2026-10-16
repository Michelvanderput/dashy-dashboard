import type { Geometry } from './core';
/** Sizes (px) at or below which the "auto" variant switches to the small drawing. */
export declare const SMALL_MAX_PX = 32;
export type Variant = 'full' | 'small' | 'auto';
/**
 * Small-size variant (24 to 32 px, e.g. menu bar or favicon). Pure: takes what core.ts computed and
 * simplifies it, so no animation of its own is introduced.
 * - body: no spring physics (squash, bounce, rotation are dropped; the body stays still)
 * - face: follows the gaze only, without rotation or squash
 * - eyes: wider, no tilt; a lid of 10% or more becomes at least 25% thick (lighter ones, like idle, are dropped so he does not look sleepy) and slants harder,
 *   a happy lower lid is at least 40%, so the expression survives at a few pixels
 */
export declare function smallGeometry(G: Geometry): Geometry;
