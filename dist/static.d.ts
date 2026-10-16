import { type DashyState, type Geometry, type Shape } from './core';
import { type Variant } from './small';
import { type Colors } from './definition';
import { type Background } from './photo';
export declare const ALL_STATES: DashyState[];
/**
 * One deterministic still of a state, straight from core.ts: same seed and pointer, 60 fps, first frame
 * at or after the sample moment where the eyes are open (never a half-blink). Moving states (working,
 * dancing) are simply a pose of the loop.
 */
export declare function settledGeometry(state: DashyState, shape?: Shape, seed?: number): Geometry;
export interface StaticOptions {
    variant?: Exclude<Variant, 'auto'>;
    /** Fill behind the body for app icons (full bleed): a colour, or a linear/radial gradient. Omit for transparent. */
    background?: Background;
    /** Body, eye and outline colours. Default: white body, near-black eyes. */
    colors?: Partial<Colors>;
    /** Extra space around the body, in the 300-unit coordinate system. Default 20 (= viewBox 20..280). */
    margin?: number;
    /** Title text for screen readers / file previews. */
    title?: string;
    /** Prefix for clipPath/mask ids so several SVGs can share one page. */
    idPrefix?: string;
}
/** A self-contained static SVG of one geometry (no scripts, no external references). */
export declare function renderSvg(G0: Geometry, o?: StaticOptions): string;
/**
 * For app icons: the pose of a moving body is a random moment of a bounce, so keep the expression (eyes, gaze) and
 * hold the body still. A barely-there lid (under 10%, as in idle) would only shave a flat spot off the round eye
 * top at 1024 px, so it is dropped here.
 */
export declare function stillGeometry(G: Geometry): Geometry;
