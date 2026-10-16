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
