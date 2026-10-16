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
export interface BodyMotionOptions {
    /**
     * Free room in px around the body: how far it may reach beyond its resting rectangle in any direction
     * (the air above and beside it). The body is guaranteed to stay within it.
     */
    room?: number;
    /** Multiplies the hop and shake before the limit applies (core.ts moves a small figure). Default 4. */
    gain?: number;
    /** Multiplies the squash and stretch before the limit applies. Default 2. */
    squashGain?: number;
}
export interface BodyMotion {
    dx: number;
    dy: number;
    rot: number;
    sx: number;
    sy: number;
    radius: number;
    u: number;
}
/**
 * Body mode: turns core.ts's body (made for a 220-unit square) into a transform for a body of any size.
 * Pure. Presentation only: it scales and limits the numbers core.ts gives, it adds no movement of its own.
 *
 * Containment, by construction: the room is split into three budgets that add up to at most the room, so the body never
 * reaches past it, whatever core.ts does: shift 35%, tilt 40%, growth (stretching) 25%. Squashing inwards is free.
 * - u: px per core unit, from the SHORT side
 * - hop and shake: core units x u x gain, at most 35% of the room
 * - tilt about the bottom centre: the farthest corner moves at most 40% of the room
 * - stretch: grows at most 25% of the room per side; shrinking is unlimited (it stays inside anyway)
 */
export declare function bodyMotion(G: Geometry, w: number, h: number, o?: BodyMotionOptions): BodyMotion;
