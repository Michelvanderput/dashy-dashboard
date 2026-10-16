/**
 * Photo mode: a still of Dashy as SVG or PNG, on a transparent, solid, linear-gradient or radial-gradient background.
 * `renderPng` needs a browser (canvas); everything else is pure string work.
 */
export type Background = string | {
    type: 'linear';
    from: string;
    to: string; /** degrees, 0 = top to bottom. Default 0. */
    angle?: number;
} | {
    type: 'radial';
    from: string;
    to: string;
};
/** The `<defs>` content (a gradient, or nothing) and the `fill` value to use for a full-bleed rectangle. */
export declare function backgroundDefs(b: Background, id: string): {
    defs: string;
    fill: string;
};
/** Rasterises an SVG string to a PNG `size` x `size` px. Browser only. */
export declare function renderPng(svg: string, size?: number): Promise<Blob>;
