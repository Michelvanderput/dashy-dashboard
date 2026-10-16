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
     * Free room in px around the card: how far the body may reach beyond its resting rectangle in any direction
     * (the gap to the neighbouring blocks and to the screen edge). The body is guaranteed to stay within it.
     */
    room?: number;
    /** Multiplies the hop and shake before the limit applies (core.ts moves a small figure). Default 3. */
    gain?: number;
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
 * Body mode: turns core.ts's body (made for a 220-unit square) into a transform for a card of any shape and size.
 * Pure. Presentation only: it scales and limits the numbers core.ts gives, it adds no movement of its own.
 *
 * Containment, by construction: the room is split into three budgets that add up to at most the room, so the card never
 * reaches past it, whatever core.ts does: shift 40%, tilt 30%, growth (stretching) 30%. Squashing inwards is free.
 * - u: px per core unit, from the SHORT side (the body is a square, a long card is just a bigger one)
 * - hop and shake: core units x u x gain, at most 40% of the room
 * - tilt about the bottom centre: the farthest corner moves at most 30% of the room
 * - stretch: grows at most 30% of the room per side; shrinking is unlimited (it stays inside anyway)
 */
export declare function bodyMotion(G: Geometry, w: number, h: number, o?: BodyMotionOptions): BodyMotion;
