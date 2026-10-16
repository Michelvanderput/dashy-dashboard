import type { Geometry } from './core';
export interface EyeLayout {
    group: string;
    pill: {
        x: string;
        y: string;
        width: string;
        height: string;
        rx: string;
    };
    lid: {
        x: string;
        y: string;
        width: string;
        height: string;
        transform: string;
    };
    low: {
        cx: string;
        cy: string;
        rx: string;
        ry: string;
    };
}
export interface Layout {
    outlineWidth: string;
    outlineRx: string;
    clipRx: string;
    body: string;
    face: string;
    eyes: EyeLayout[];
}
/** Geometry -> the exact SVG attribute values. Shared by the live DOM drawing (svg.ts) and the static export (static.ts). */
export declare function layout(G: Geometry, small?: boolean): Layout;
export interface FaceMotionOptions {
    /** Multiplies how far the face moves inside the block (core.ts moves a small figure, a block is big). Default 2.2. */
    gain?: number;
    /** Squash and stretch of the face, same idea. Default 2. */
    squashGain?: number;
    /** Minimum distance in core units between the eyes and the edge of the block. Default 12. */
    margin?: number;
}
export interface FaceMotion {
    tx: number;
    ty: number;
    rot: number;
    sx: number;
    sy: number;
}
/**
 * Body mode, "the block is Dashy and the block stands still": all the life is in the face. This turns core.ts's face
 * (made for a 220-unit body) into the transform of the face group on a block of any shape and size, in the same coordinate
 * system as the viewBox (the block centre is 150,150; one unit = short side / 220 px).
 * Pure. Presentation only: it amplifies and limits the numbers core.ts gives, it adds no movement of its own.
 * The eyes are guaranteed to stay at least `margin` units inside the block: the shift is limited by the radius that holds both
 * eyes, whatever the tilt, so no rotation or squash can push them out.
 */
export declare function faceMotion(G: Geometry, w: number, h: number, o?: FaceMotionOptions): FaceMotion;
